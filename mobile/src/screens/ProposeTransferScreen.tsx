import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PublicKey } from "@solana/web3.js";
import { TokenAvatar } from "../components/TokenAvatar";
import { RiskCard } from "../components/RiskCard";
import { useWallet } from "../wallet/WalletContext";
import { prepareTransfer, type TransferAsset } from "../solana/multisig";
import { humanizeError } from "../solana/errors";
import { fetchHoldings } from "../solana/treasury";
import { fetchTokenMeta } from "../solana/tokens";
import { vaultPda } from "../config/multisig";
import { looksLikeName, resolveName } from "../naming/resolve";
import { assessRecipient, type RiskReport } from "../safety/risk";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

const FEE_BUFFER_SOL = 0.001; // leave a little SOL in the vault for rent/fees

interface VaultAsset {
  key: string; // "sol" or the mint
  kind: "sol" | "spl";
  mint?: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: number;
  logoURI?: string;
}

export function ProposeTransferScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { keypair } = useWallet();
  const vault = vaultPda()?.toBase58() ?? null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assetList, setAssetList] = useState<VaultAsset[]>([]);
  const [assetKey, setAssetKey] = useState("sol");
  const [recipient, setRecipient] = useState("");
  const [amt, setAmt] = useState("");
  const [busy, setBusy] = useState(false);
  const [proposed, setProposed] = useState(false);
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [nameAddr, setNameAddr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Load what the vault actually holds, with names/logos, for the asset picker.
  const loadAssets = useCallback(async () => {
    if (!vault) return;
    const h = await fetchHoldings(vault);
    const list: VaultAsset[] = [
      { key: "sol", kind: "sol", symbol: "SOL", name: "Solana", decimals: 9, balance: h.sol },
    ];
    for (const t of h.tokens) {
      const meta = await fetchTokenMeta(t.mint);
      list.push({
        key: t.mint,
        kind: "spl",
        mint: t.mint,
        symbol: meta?.symbol || shortAddress(t.mint, 4, 4),
        name: meta?.name || meta?.symbol || t.mint,
        decimals: t.decimals,
        balance: t.amount,
        logoURI: meta?.logoURI,
      });
    }
    setAssetList(list);
  }, [vault]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount fetch
    loadAssets()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAssets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAssets();
    } catch {
      /* keep whatever we have */
    } finally {
      setRefreshing(false);
    }
  }, [loadAssets]);

  const selected = assetList.find((a) => a.key === assetKey) ?? assetList[0];

  const trimmedTo = recipient.trim();
  const nameKind = looksLikeName(trimmedTo);

  const isValidSol = (addr: string): boolean => {
    try {
      return Boolean(new PublicKey(addr));
    } catch {
      return false;
    }
  };

  // Resolve .sol names to an address (debounced).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before debounce
    setNameAddr(null);
    if (nameKind !== "sol") {
      setResolving(false);
      return;
    }
    let cancelled = false;
    setResolving(true);
    const id = setTimeout(async () => {
      const addr = await resolveName(trimmedTo);
      if (!cancelled) {
        setNameAddr(addr);
        setResolving(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [trimmedTo, nameKind]);

  const rawValid = !nameKind && trimmedTo.length > 0 && isValidSol(trimmedTo);
  const effectiveTo = nameKind ? nameAddr : rawValid ? trimmedTo : null;
  const validAddress = !!effectiveTo && isValidSol(effectiveTo);

  // Screen the recipient (same drainer/scam checks as a normal send).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before debounce
    setRisk(null);
    setAcknowledged(false);
    if (!validAddress || !effectiveTo) return;
    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const report = await assessRecipient(effectiveTo, vault);
        if (!cancelled) setRisk(report);
      } catch {
        if (!cancelled) setRisk(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [effectiveTo, validAddress, vault]);

  const amtNum = parseFloat(amt) || 0;
  const bal = selected?.balance ?? 0;
  const over = amtNum > bal;
  const blockedByRisk = risk?.level === "danger" && !acknowledged;
  const valid = !!selected && validAddress && amtNum > 0 && !over && !blockedByRisk && !busy;

  const maxAmount = selected?.kind === "sol" ? Math.max(0, bal - FEE_BUFFER_SOL) : bal;

  const doPropose = async () => {
    if (!keypair || !selected || !effectiveTo || busy) return;
    // Prepare (build + simulate + fee) so the confirm shows the network fee and catches a
    // doomed proposal with the real reason before anything is sent.
    setBusy(true);
    const asset: TransferAsset = {
      kind: selected.kind,
      mint: selected.mint,
      decimals: selected.decimals,
      symbol: selected.symbol,
    };
    let prepared;
    try {
      prepared = await prepareTransfer(keypair, effectiveTo, amtNum, asset);
    } catch (e) {
      Alert.alert("Couldn't prepare", e instanceof Error ? e.message : "Please try again.");
      return;
    } finally {
      setBusy(false);
    }
    Alert.alert(
      "Propose this transfer?",
      `Send ${fmtAmount(amtNum)} ${selected.symbol} from the treasury to:\n\n${effectiveTo}\n\n` +
        `Network fee ≈ ${prepared.feeSol.toFixed(6)} SOL${prepared.rent ? " + a small refundable rent deposit" : ""} (from your wallet).` +
        (prepared.warn ? `\n\n⚠️ ${prepared.warn}` : "") +
        `\n\nFunds don't move until your signers approve and it's executed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: prepared.warn ? "Propose anyway" : "Propose",
          onPress: async () => {
            setBusy(true);
            try {
              await prepared.send();
              setProposed(true);
            } catch (e) {
              Alert.alert("Couldn't propose", humanizeError(e, { action: "send" }));
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  if (proposed) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color={colors.bg} />
        </View>
        <Text style={styles.successTitle}>Proposed</Text>
        <Text style={styles.successSub}>
          Your signers can now approve sending {fmtAmount(amtNum)} {selected?.symbol} to{" "}
          {nameKind ? trimmedTo : shortAddress(effectiveTo ?? trimmedTo, 4, 4)}.
        </Text>
        <Pressable onPress={() => nav.navigate("TreasuryMultisig")} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>View proposals</Text>
        </Pressable>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} style={styles.linkBtn}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title}>Propose a transfer</Text>
        <Pressable onPress={() => nav.canGoBack() && nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(5) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <Text style={styles.sub}>
          Spend from the multisig treasury. This files a proposal your signers must approve — nothing
          moves until then.
        </Text>

        <View>
          <Text style={styles.label}>Asset</Text>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={{ alignSelf: "flex-start", marginTop: spacing(2) }} />
          ) : assetList.length === 0 ? (
            <Text style={styles.emptyAssets}>The treasury vault holds no funds yet.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing(1) }}>
              <View style={styles.chips}>
                {assetList.map((a) => {
                  const active = a.key === selected?.key;
                  return (
                    <Pressable
                      key={a.key}
                      onPress={() => {
                        setAssetKey(a.key);
                        setAmt("");
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <TokenAvatar symbol={a.symbol} color={colors.primary} size={24} logoURI={a.logoURI} />
                      <Text style={[styles.chipText, active && { color: colors.bg }]}>{a.symbol}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          )}
        </View>

        <View>
          <Text style={styles.label}>Recipient address</Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="Address or name.sol"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {resolving && <Text style={styles.hintMuted}>Resolving {trimmedTo}…</Text>}
          {!resolving && nameKind === "sol" && validAddress && effectiveTo && (
            <Text style={styles.resolved}>✓ {shortAddress(effectiveTo, 6, 6)}</Text>
          )}
          {!resolving && nameKind === "sol" && !nameAddr && (
            <Text style={styles.warn}>Couldn’t resolve {trimmedTo}.</Text>
          )}
          {nameKind === "eth" && (
            <Text style={styles.warn}>The treasury is on Solana — use a Solana address or name.sol.</Text>
          )}
          {!nameKind && trimmedTo.length > 0 && !validAddress && (
            <Text style={styles.warn}>That doesn’t look like a valid Solana address.</Text>
          )}
        </View>

        <View>
          <View style={styles.amountHeader}>
            <Text style={styles.label}>Amount</Text>
            {selected && (
              <Text style={styles.balance}>
                Treasury: {fmtAmount(selected.balance)} {selected.symbol}
              </Text>
            )}
          </View>
          <View style={[styles.amountBox, over && { borderColor: colors.negative }]}>
            <TextInput
              value={amt}
              onChangeText={setAmt}
              placeholder="0.0"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <View style={styles.amountRight}>
              <Pressable onPress={() => setAmt(String(maxAmount))} style={styles.maxBtn}>
                <Text style={styles.maxText}>MAX</Text>
              </Pressable>
              <Text style={styles.symbolTag}>{selected?.symbol ?? ""}</Text>
            </View>
          </View>
          <Text style={[styles.usdLine, over && { color: colors.negative }]}>
            {over ? "More than the treasury holds" : "Network fee paid by you when executing"}
          </Text>
        </View>

        {(checking || risk) && <RiskCard report={risk} checking={checking} />}

        {risk?.level === "danger" && (
          <Pressable onPress={() => setAcknowledged((a) => !a)} style={styles.ackRow}>
            <Ionicons name={acknowledged ? "checkbox" : "square-outline"} size={20} color={colors.negative} />
            <Text style={styles.ackText}>I understand the risk and want to propose anyway.</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Pressable
          disabled={!valid}
          onPress={doPropose}
          style={[styles.primaryBtn, !valid && styles.primaryDisabled]}
        >
          {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Propose transfer</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: spacing(3), paddingHorizontal: spacing(6) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.small, lineHeight: 20 },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginBottom: spacing(2) },
  emptyAssets: { color: colors.textMuted, fontSize: font.body, marginTop: spacing(1) },
  chips: { flexDirection: "row", gap: spacing(2), paddingHorizontal: spacing(1) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    color: colors.text,
    fontSize: font.body,
  },
  warn: { color: colors.warning, fontSize: font.small, marginTop: spacing(2), marginLeft: spacing(1) },
  hintMuted: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(2), marginLeft: spacing(1) },
  resolved: { color: colors.positive, fontSize: font.small, fontWeight: "700", marginTop: spacing(2), marginLeft: spacing(1) },
  amountHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  balance: { color: colors.textMuted, fontSize: font.small, marginBottom: spacing(2) },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
  },
  amountInput: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800", paddingVertical: spacing(3) },
  amountRight: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  maxBtn: { backgroundColor: colors.bgElevated, paddingHorizontal: spacing(2.5), paddingVertical: spacing(1), borderRadius: radius.sm },
  maxText: { color: colors.primary, fontSize: font.tiny, fontWeight: "800" },
  symbolTag: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  usdLine: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(2), marginLeft: spacing(1) },
  ackRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(1) },
  ackText: { flex: 1, color: colors.negative, fontSize: font.small, fontWeight: "600" },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center", alignSelf: "stretch" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  linkBtn: { paddingVertical: spacing(2) },
  link: { color: colors.primary, fontSize: font.body, fontWeight: "700" },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing(2) },
  successTitle: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  successSub: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
});
