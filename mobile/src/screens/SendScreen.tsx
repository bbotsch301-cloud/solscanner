import * as Clipboard from "expo-clipboard";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
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
import { TokenAvatar } from "../components/TokenAvatar";
import { RiskCard } from "../components/RiskCard";
import { ScreenHeader } from "../components/ScreenHeader";
import { Button } from "../components/Button";
import { SuccessCheck } from "../components/SuccessCheck";
import { haptics } from "../ui/haptics";
import { nativeLogo } from "../config/logos";
import { useWallet, type UnifiedAsset } from "../wallet/WalletContext";
import { isEvmAddress, isChecksumValid } from "../wallet/evm";
import { looksLikeName, resolveName } from "../naming/resolve";
import { assessRecipient, type RiskReport } from "../safety/risk";
import { assessEvmRecipient } from "../safety/evmRisk";
import { findLookalike, recordRecipient } from "../safety/recipients";
import { findContact } from "../contacts/contacts";
import { ContactPicker } from "../components/ContactPicker";
import { ContactFormModal } from "../components/ContactFormModal";
import { humanizeError } from "../solana/errors";
import { computeFee, getTransferFee, type TransferFee } from "../solana/token2022";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

const FEE_BUFFER_SOL = 0.001;
const FEE_BUFFER_EVM = 0.002; // leave a little native for gas
const LARGE_USD = 1000; // amounts worth at least this get an extra "large transfer" caution

function Detail({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  copied?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <View style={styles.detailRight}>
        <Text style={styles.detailValue}>{value}</Text>
        {onCopy && (
          <Pressable onPress={onCopy} hitSlop={8}>
            <Ionicons
              name={copied ? "checkmark" : "copy-outline"}
              size={15}
              color={copied ? colors.positive : colors.textMuted}
            />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export function SendScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Send">>();
  const insets = useSafeAreaInsets();
  const { activeChain, activeAddress, native, assets, sendAsset, previewSend, refresh: refreshWallet } = useWallet();
  const [refreshing, setRefreshing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copyField = async (key: string, value: string) => {
    await Clipboard.setStringAsync(value);
    haptics.tap();
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const isSolana = activeChain.kind === "solana";

  // Native asset + the chain's tokens, unified.
  const assetList = useMemo<UnifiedAsset[]>(
    () => [
      {
        key: "native",
        chainId: activeChain.id,
        kind: "native",
        symbol: native.symbol,
        decimals: activeChain.decimals,
        balance: native.balance ?? 0,
        usd: native.usd,
        logoURI: nativeLogo[activeChain.id],
      },
      ...assets,
    ],
    [native, assets, activeChain.decimals, activeChain.id]
  );

  const [assetKey, setAssetKey] = useState(route.params?.asset ?? "native");
  const selected = assetList.find((a) => a.key === assetKey) ?? assetList[0];

  // Seeded from a scan when the scanner sent us here. The address still goes through the lookalike
  // and poisoning checks below — arriving by camera makes an address no more trustworthy than one
  // that was pasted, and skipping those because of how the bytes got here would be backwards.
  const [recipient, setRecipient] = useState(route.params?.to ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saveAddr, setSaveAddr] = useState<string | null>(null); // address pending "save to contacts"
  const [contactsRev, setContactsRev] = useState(0); // bump to re-read the contact match after saving
  // A Solana Pay code can state an amount; a bare address never does, so this is usually empty.
  const [amt, setAmt] = useState(route.params?.amount ?? "");
  const [sending, setSending] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [fee, setFee] = useState<TransferFee | null>(null);
  const [nameAddr, setNameAddr] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Live Token-2022 transfer fee (Solana only, e.g. XGO's 1.11%).
  useEffect(() => {
    setFee(null);
    if (!isSolana || selected.kind !== "spl" || selected.program !== "token2022" || !selected.mint) return;
    let cancelled = false;
    getTransferFee(selected.mint).then((f) => {
      if (!cancelled) setFee(f);
    });
    return () => {
      cancelled = true;
    };
  }, [isSolana, selected.kind, selected.program, selected.mint]);

  const trimmedTo = recipient.trim();
  const nameKind = looksLikeName(trimmedTo);

  const isValidForChain = (addr: string): boolean => {
    if (isSolana) {
      try {
        return Boolean(new PublicKey(addr));
      } catch {
        return false;
      }
    }
    // Require a valid EIP-55 checksum too, so a single mistyped (miscased) character is
    // caught before funds leave — not just a well-formed but wrong address.
    return isEvmAddress(addr) && isChecksumValid(addr);
  };

  // Resolve .eth / .sol names to an address (debounced).
  useEffect(() => {
    setNameAddr(null);
    if (!nameKind) {
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

  // The address we actually send to: a resolved name, or a valid raw address.
  const rawValid = !nameKind && trimmedTo.length > 0 && isValidForChain(trimmedTo);
  const effectiveTo = nameKind ? nameAddr : rawValid ? trimmedTo : null;
  const validAddress = !!effectiveTo && isValidForChain(effectiveTo);

  // Screen the recipient on both ecosystems.
  useEffect(() => {
    setRisk(null);
    setAcknowledged(false);
    if (!validAddress || !effectiveTo) return;
    let cancelled = false;
    setChecking(true);
    const tokenAddr = selected.kind === "erc20" ? selected.address : undefined;
    const id = setTimeout(async () => {
      try {
        const report = isSolana
          ? await assessRecipient(effectiveTo, activeAddress)
          : await assessEvmRecipient(activeChain, effectiveTo, activeAddress, tokenAddr);
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
  }, [effectiveTo, validAddress, activeAddress, isSolana, activeChain, selected.kind, selected.address]);

  // Address-poisoning: does this recipient imitate one we've sent to before?
  const lookalike = useMemo(
    () => (validAddress && effectiveTo ? findLookalike(effectiveTo) : null),
    [validAddress, effectiveTo]
  );
  // A saved address-book match for the recipient (shown by name; also treated as trusted).
  const matchedContact = useMemo(() => {
    void contactsRev; // recompute after a contact is saved
    return validAddress && effectiveTo ? findContact(effectiveTo) : undefined;
  }, [validAddress, effectiveTo, contactsRev]);

  const amtNum = parseFloat(amt) || 0;
  const over = amtNum > selected.balance;
  const blockedByRisk = risk?.level === "danger" && !acknowledged;
  const valid = validAddress && amtNum > 0 && amtNum <= selected.balance && !blockedByRisk;

  // Non-blocking "are you sure?" cautions for high-consequence sends.
  const perUnitUsd = selected.usd != null && selected.balance > 0 ? selected.usd / selected.balance : null;
  const amtUsd = perUnitUsd != null ? perUnitUsd * amtNum : null;
  const wholeBalance = amtNum > 0 && amtNum >= selected.balance - 1e-9;
  const largeUsd = amtUsd != null && amtUsd >= LARGE_USD;
  const amountCaution = !over && (wholeBalance || largeUsd)
    ? wholeBalance
      ? selected.kind === "native"
        ? `You're sending your entire ${selected.symbol} balance — nothing will be left to cover future network fees.`
        : `You're sending your entire ${selected.symbol} balance.`
      : `This is a large transfer${amtUsd != null ? ` (~$${Math.round(amtUsd).toLocaleString("en-US")})` : ""}. Double-check the amount and recipient.`
    : null;

  const buffer = isSolana ? FEE_BUFFER_SOL : FEE_BUFFER_EVM;
  const maxAmount = selected.kind === "native" ? Math.max(0, selected.balance - buffer) : selected.balance;

  const reallySend = async () => {
    if (!effectiveTo) return;
    setSending(true);
    setError(null);
    try {
      const sig = await sendAsset(selected, effectiveTo, amtNum);
      setSignature(sig);
      haptics.success();
      recordRecipient(effectiveTo).catch(() => {}); // remember for future poisoning checks
    } catch (e) {
      haptics.error();
      setError(humanizeError(e, { action: "send", symbol: selected.symbol, native: native.symbol }));
    } finally {
      setSending(false);
    }
  };

  // Simulate first (catches a tx that would fail and prices the network fee), then confirm
  // with the FULL address shown, so a look-alike / poisoned address is caught.
  const doSend = async () => {
    if (!effectiveTo) return;
    setPreviewing(true);
    setError(null);
    let feeLine = "";
    try {
      const p = await previewSend(selected, effectiveTo, amtNum);
      const perUnit = native.usd != null && native.balance ? native.usd / native.balance : null;
      const usd = perUnit != null ? ` (~$${(p.feeNative * perUnit).toFixed(2)})` : "";
      const feeStr = p.feeNative < 0.000001 ? "<0.000001" : p.feeNative.toLocaleString("en-US", { maximumFractionDigits: 6 });
      feeLine = `\n\nEstimated network fee: ${feeStr} ${p.symbol}${usd}`;
    } catch (e) {
      setPreviewing(false);
      setError(e instanceof Error ? e.message : humanizeError(e, { action: "send", symbol: selected.symbol, native: native.symbol }));
      return;
    }
    setPreviewing(false);
    const poisonLine = lookalike
      ? `\n\n⚠ This closely resembles a different address you've used before (${shortAddress(lookalike, 6, 6)}). Address-poisoning scams rely on lookalikes — be certain this is the one you mean.`
      : "";
    const cautionLine = amountCaution ? `\n\n${amountCaution}` : "";
    const toLine = matchedContact ? `${matchedContact.name}\n${effectiveTo}` : effectiveTo;
    Alert.alert(
      "Confirm send",
      `Send ${fmtAmount(amtNum)} ${selected.symbol} on ${activeChain.name} to:\n\n${toLine}${feeLine}${poisonLine}${cautionLine}\n\nDouble-check every character — sends can’t be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", style: "default", onPress: reallySend },
      ]
    );
  };

  if (signature) {
    const toDisplay = nameKind ? trimmedTo : shortAddress(effectiveTo ?? trimmedTo, 6, 6);
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.successBody}>
          <SuccessCheck />
          <Text style={styles.successTitle}>Sent</Text>
          <Text style={styles.successAmount}>
            {fmtAmount(amtNum)} {selected.symbol}
          </Text>

          <View style={styles.detailCard}>
            <Detail
              label="To"
              value={toDisplay}
              onCopy={() => copyField("to", effectiveTo ?? trimmedTo)}
              copied={copied === "to"}
            />
            <View style={styles.detailDivider} />
            <Detail label="Network" value={activeChain.name} />
            <View style={styles.detailDivider} />
            <Detail
              label="Transaction"
              value={shortAddress(signature, 6, 6)}
              onCopy={() => copyField("sig", signature)}
              copied={copied === "sig"}
            />
          </View>
        </View>

        <View style={[styles.successFooter, { paddingBottom: insets.bottom + spacing(3) }]}>
          <Button
            label="View on explorer"
            variant="secondary"
            icon="open-outline"
            onPress={() => Linking.openURL(activeChain.explorerTx(signature))}
          />
          <Button label="Done" onPress={() => nav.goBack()} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScreenHeader title={`Send · ${activeChain.name}`} size="modal" onClose={() => nav.goBack()} />

      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(5) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              try {
                await refreshWallet();
              } finally {
                setRefreshing(false);
              }
            }}
            tintColor={colors.primary}
          />
        }
      >
        <View>
          <Text style={styles.label}>Asset</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing(1) }}>
            <View style={styles.chips}>
              {assetList.map((a) => {
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
          <View style={styles.labelRow}>
            <Text style={styles.label}>Recipient address</Text>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.contactsBtn} hitSlop={8}>
              <Ionicons name="people" size={15} color={colors.primary} />
              <Text style={styles.contactsBtnText}>Contacts</Text>
            </Pressable>
          </View>
          <TextInput
            value={recipient}
            onChangeText={setRecipient}
            placeholder={isSolana ? "Address or name.sol" : "0x… address or name.eth"}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          {matchedContact && (
            <Text style={styles.resolved}>✓ {matchedContact.name}</Text>
          )}
          {validAddress && effectiveTo && !matchedContact && !nameKind && (
            <Pressable onPress={() => setSaveAddr(effectiveTo)} hitSlop={6}>
              <Text style={styles.saveLink}>＋ Save to contacts</Text>
            </Pressable>
          )}
          {resolving && <Text style={styles.hintMuted}>Resolving {trimmedTo}…</Text>}
          {!resolving && nameKind && validAddress && effectiveTo && (
            <Text style={styles.resolved}>✓ {shortAddress(effectiveTo, 6, 6)}</Text>
          )}
          {!resolving && nameKind && nameAddr && !validAddress && (
            <Text style={styles.warn}>{trimmedTo} resolves to a different chain — switch chains to use it.</Text>
          )}
          {!resolving && nameKind && !nameAddr && (
            <Text style={styles.warn}>Couldn’t resolve {trimmedTo}.</Text>
          )}
          {!nameKind && trimmedTo.length > 0 && !validAddress && (
            <Text style={styles.warn}>
              {!isSolana && isEvmAddress(trimmedTo) && !isChecksumValid(trimmedTo)
                ? "This address’s checksum doesn’t match — a character looks mistyped. Re-check it."
                : `That doesn’t look like a valid ${activeChain.name} address.`}
            </Text>
          )}
          {lookalike && (
            <View style={styles.poisonWarn}>
              <Ionicons name="warning" size={16} color={colors.negative} />
              <Text style={styles.poisonText}>
                Resembles a different address you’ve used before ({shortAddress(lookalike, 6, 6)}). Address-poisoning
                scams use lookalikes — verify every character.
              </Text>
            </View>
          )}
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
            {over ? "Insufficient balance" : `Network fee paid in ${native.symbol}`}
          </Text>
          {fee && amtNum > 0 && !over && (
            <Text style={styles.feeLine}>
              {(fee.bps / 100).toFixed(2)}% token fee · recipient receives ≈{" "}
              {fmtAmount(amtNum - computeFee(amtNum, selected.decimals, fee))} {selected.symbol}
            </Text>
          )}
        </View>

        {(checking || risk) && <RiskCard report={risk} checking={checking} />}

        {amountCaution && (
          <View style={styles.amountCaution}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
            <Text style={styles.amountCautionText}>{amountCaution}</Text>
          </View>
        )}

        {risk?.level === "danger" && (
          <Pressable onPress={() => setAcknowledged((a) => !a)} style={styles.ackRow}>
            <Ionicons name={acknowledged ? "checkbox" : "square-outline"} size={20} color={colors.negative} />
            <Text style={styles.ackText}>I understand the risk and want to send anyway.</Text>
          </Pressable>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Button label="Send" onPress={doSend} disabled={!valid} loading={sending || previewing} />
      </View>

      <ContactPicker
        visible={pickerOpen}
        kind={isSolana ? "solana" : "evm"}
        onClose={() => setPickerOpen(false)}
        onSelect={(addr) => setRecipient(addr)}
      />
      <ContactFormModal
        visible={saveAddr != null}
        presetAddress={saveAddr ?? undefined}
        onClose={() => setSaveAddr(null)}
        onSaved={() => setContactsRev((r) => r + 1)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  label: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginBottom: spacing(2) },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  contactsBtn: { flexDirection: "row", alignItems: "center", gap: spacing(1), paddingBottom: spacing(2) },
  contactsBtnText: { color: colors.primary, fontSize: font.small, fontWeight: "800" },
  saveLink: { color: colors.primary, fontSize: font.small, fontWeight: "700", marginTop: spacing(2), marginLeft: spacing(1) },
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
  poisonWarn: {
    flexDirection: "row",
    gap: spacing(2),
    alignItems: "flex-start",
    backgroundColor: colors.negative + "18",
    borderRadius: radius.md,
    padding: spacing(3),
    marginTop: spacing(3),
  },
  poisonText: { flex: 1, color: colors.negative, fontSize: font.small, lineHeight: 18 },
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
  feeLine: { color: colors.warning, fontSize: font.small, marginTop: spacing(1), marginLeft: spacing(1) },
  amountCaution: {
    flexDirection: "row",
    gap: spacing(2),
    alignItems: "flex-start",
    backgroundColor: colors.warning + "18",
    borderRadius: radius.md,
    padding: spacing(3),
  },
  amountCautionText: { flex: 1, color: colors.warning, fontSize: font.small, lineHeight: 18 },
  error: { color: colors.negative, fontSize: font.small },
  ackRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(1) },
  ackText: { flex: 1, color: colors.negative, fontSize: font.small, fontWeight: "600" },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },

  // Success state
  successBody: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing(6) },
  successTitle: { color: colors.text, fontSize: font.h1, fontWeight: "900" },
  successAmount: { color: colors.textMuted, fontSize: font.h3, fontWeight: "700", marginTop: spacing(1), marginBottom: spacing(6) },
  detailCard: { alignSelf: "stretch", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, paddingHorizontal: spacing(4) },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing(3.5) },
  detailLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: "600" },
  detailRight: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  detailValue: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  detailDivider: { height: 1, backgroundColor: colors.cardBorder },
  successFooter: { paddingHorizontal: spacing(4), paddingTop: spacing(3), gap: spacing(2) },
});
