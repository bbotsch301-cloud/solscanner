import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { RiskCard } from "../components/RiskCard";
import { useWallet } from "../wallet/WalletContext";
import { assessRecipient, type RiskReport } from "../safety/risk";
import { solscanTx } from "../solana/connection";
import { computeFee, getTransferFee, type TransferFee } from "../solana/token2022";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
const FEE_BUFFER = 0.001; // leave a little SOL for the network fee

interface Asset {
  key: string; // "SOL" or mint
  symbol: string;
  decimals: number;
  balance: number;
  mint: string | null; // null = native SOL
  logoURI?: string;
  program: "legacy" | "token2022";
}

export function SendScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Send">>();
  const insets = useSafeAreaInsets();
  const { address, solBalance, tokens, send, sendToken } = useWallet();

  const assets = useMemo<Asset[]>(
    () => [
      { key: "SOL", symbol: "SOL", decimals: 9, balance: solBalance ?? 0, mint: null, logoURI: SOL_LOGO, program: "legacy" as const },
      ...tokens.map((t) => ({
        key: t.mint,
        symbol: t.symbol ?? shortAddress(t.mint, 4, 4),
        decimals: t.decimals,
        balance: t.amount,
        mint: t.mint,
        logoURI: t.logoURI,
        program: t.program,
      })),
    ],
    [solBalance, tokens]
  );

  const [assetKey, setAssetKey] = useState(route.params?.asset ?? "SOL");
  const selected = assets.find((a) => a.key === assetKey) ?? assets[0];

  const [recipient, setRecipient] = useState("");
  const [amt, setAmt] = useState("");
  const [sending, setSending] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fee, setFee] = useState<TransferFee | null>(null);

  // Read the live transfer fee for Token-2022 assets (e.g. XGO's 1.11%).
  useEffect(() => {
    setFee(null);
    if (selected.program !== "token2022" || !selected.mint) return;
    let cancelled = false;
    getTransferFee(selected.mint).then((f) => {
      if (!cancelled) setFee(f);
    });
    return () => {
      cancelled = true;
    };
  }, [selected.program, selected.mint]);

  const trimmedTo = recipient.trim();
  const validAddress = useMemo(() => {
    try {
      // eslint-disable-next-line no-new
      new PublicKey(trimmedTo);
      return true;
    } catch {
      return false;
    }
  }, [trimmedTo]);

  // Screen the recipient (debounced) whenever a valid address is entered.
  useEffect(() => {
    setRisk(null);
    setAcknowledged(false);
    if (!validAddress) return;
    let cancelled = false;
    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const report = await assessRecipient(trimmedTo, address);
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
  }, [trimmedTo, validAddress, address]);

  const amtNum = parseFloat(amt) || 0;
  const over = amtNum > selected.balance;
  const blockedByRisk = risk?.level === "danger" && !acknowledged;
  const valid = useMemo(
    () => validAddress && amtNum > 0 && amtNum <= selected.balance && !blockedByRisk,
    [validAddress, amtNum, selected.balance, blockedByRisk]
  );

  const maxAmount = selected.mint === null ? Math.max(0, selected.balance - FEE_BUFFER) : selected.balance;

  const doSend = async () => {
    setSending(true);
    setError(null);
    try {
      const to = recipient.trim();
      const sig =
        selected.mint === null
          ? await send(to, amtNum)
          : await sendToken(selected.mint, to, amtNum, selected.decimals);
      setSignature(sig);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (signature) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color={colors.bg} />
        </View>
        <Text style={styles.successTitle}>Sent</Text>
        <Text style={styles.successSub}>
          {fmtAmount(amtNum)} {selected.symbol} to {shortAddress(recipient.trim(), 4, 4)}
        </Text>
        <Pressable onPress={() => Linking.openURL(solscanTx(signature))}>
          <Text style={styles.link}>View on Solscan ↗</Text>
        </Pressable>
        <Pressable onPress={() => nav.goBack()} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title}>Send</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(5) }} keyboardShouldPersistTaps="handled">
        <View>
          <Text style={styles.label}>Asset</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing(1) }}>
            <View style={styles.chips}>
              {assets.map((a) => {
                const active = a.key === selected.key;
                return (
                  <Pressable
                    key={a.key}
                    onPress={() => { setAssetKey(a.key); setAmt(""); }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <TokenAvatar symbol={a.symbol} color={colors.primary} size={24} logoURI={a.logoURI} />
                    <Text style={[styles.chipText, active && { color: colors.bg }]}>{a.symbol}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        </View>

        <View>
          <Text style={styles.label}>Recipient address</Text>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder="Paste a Solana address"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </View>

        <View>
          <View style={styles.amountHeader}>
            <Text style={styles.label}>Amount</Text>
            <Text style={styles.balance}>Balance: {fmtAmount(selected.balance)} {selected.symbol}</Text>
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
              <Text style={styles.symbolTag}>{selected.symbol}</Text>
            </View>
          </View>
          <Text style={[styles.usdLine, over && { color: colors.negative }]}>
            {over ? "Insufficient balance" : "Devnet · network fee ~0.000005 SOL"}
          </Text>
          {fee && amtNum > 0 && !over && (
            <Text style={styles.feeLine}>
              {(fee.bps / 100).toFixed(2)}% token fee · recipient receives ≈{" "}
              {fmtAmount(amtNum - computeFee(amtNum, selected.decimals, fee))} {selected.symbol}
            </Text>
          )}
        </View>

        {(checking || risk) && <RiskCard report={risk} checking={checking} />}

        {risk?.level === "danger" && (
          <Pressable onPress={() => setAcknowledged((a) => !a)} style={styles.ackRow}>
            <Ionicons
              name={acknowledged ? "checkbox" : "square-outline"}
              size={20}
              color={colors.negative}
            />
            <Text style={styles.ackText}>I understand the risk and want to send anyway.</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Pressable
          disabled={!valid || sending}
          onPress={doSend}
          style={[styles.primaryBtn, (!valid || sending) && styles.primaryDisabled]}
        >
          {sending ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>Send</Text>}
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
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginBottom: spacing(2) },
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
  feeLine: { color: colors.warning, fontSize: font.small, marginTop: spacing(1), marginLeft: spacing(1) },
  error: { color: colors.negative, fontSize: font.small },
  ackRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(1) },
  ackText: { flex: 1, color: colors.negative, fontSize: font.small, fontWeight: "600" },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing(2) },
  successTitle: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  successSub: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
  link: { color: colors.primary, fontSize: font.body, fontWeight: "700", marginTop: spacing(1) },
});
