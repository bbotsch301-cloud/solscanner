import { useNavigation } from "@react-navigation/native";
import { useMemo, useState } from "react";
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
import { useWallet } from "../wallet/WalletContext";
import { solscanTx } from "../solana/connection";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

const FEE_BUFFER = 0.001; // leave a little SOL for the network fee

export function SendScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();
  const { solBalance, send } = useWallet();

  const [recipient, setRecipient] = useState("");
  const [amt, setAmt] = useState("");
  const [sending, setSending] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const balance = solBalance ?? 0;
  const amtNum = parseFloat(amt) || 0;
  const over = amtNum > balance;
  const valid = useMemo(
    () => recipient.trim().length >= 32 && amtNum > 0 && amtNum <= balance,
    [recipient, amtNum, balance]
  );

  const doSend = async () => {
    setSending(true);
    setError(null);
    try {
      const sig = await send(recipient.trim(), amtNum);
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
          {fmtAmount(amtNum)} SOL to {shortAddress(recipient.trim(), 4, 4)}
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
        <Text style={styles.title}>Send SOL</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(5) }} keyboardShouldPersistTaps="handled">
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
            <Text style={styles.balance}>Balance: {fmtAmount(balance)} SOL</Text>
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
              <Pressable
                onPress={() => setAmt(String(Math.max(0, balance - FEE_BUFFER)))}
                style={styles.maxBtn}
              >
                <Text style={styles.maxText}>MAX</Text>
              </Pressable>
              <Text style={styles.symbolTag}>SOL</Text>
            </View>
          </View>
          <Text style={[styles.usdLine, over && { color: colors.negative }]}>
            {over ? "Insufficient balance" : "Devnet · network fee ~0.000005 SOL"}
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Pressable
          disabled={!valid || sending}
          onPress={doSend}
          style={[styles.primaryBtn, (!valid || sending) && styles.primaryDisabled]}
        >
          {sending ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.primaryText}>Send</Text>
          )}
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
  error: { color: colors.negative, fontSize: font.small },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: spacing(2) },
  successTitle: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  successSub: { color: colors.textMuted, fontSize: font.body },
  link: { color: colors.primary, fontSize: font.body, fontWeight: "700", marginTop: spacing(1) },
});
