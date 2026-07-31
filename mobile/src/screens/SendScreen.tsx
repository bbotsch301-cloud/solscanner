import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
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
import { getToken, tokens } from "../data/mockWallet";
import { amount as fmtAmount, colors, font, radius, spacing, usd } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

export function SendScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "Send">>();
  const insets = useSafeAreaInsets();

  const [symbol, setSymbol] = useState(route.params?.symbol ?? "SOL");
  const [recipient, setRecipient] = useState("");
  const [amt, setAmt] = useState("");
  const [sent, setSent] = useState(false);

  const token = getToken(symbol)!;
  const amtNum = parseFloat(amt) || 0;
  const usdValue = amtNum * token.pricePerToken;

  const valid = useMemo(() => {
    return recipient.trim().length >= 32 && amtNum > 0 && amtNum <= token.amount;
  }, [recipient, amtNum, token.amount]);

  const over = amtNum > token.amount;

  if (sent) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={48} color={colors.bg} />
        </View>
        <Text style={styles.successTitle}>Sent (simulated)</Text>
        <Text style={styles.successSub}>
          {fmtAmount(amtNum)} {symbol} to {recipient.slice(0, 6)}…
        </Text>
        <Text style={styles.mockNote}>
          No real transaction was made — this is the UI prototype.
        </Text>
        <Pressable onPress={() => nav.goBack()} style={styles.primaryBtn}>
          <Text style={styles.primaryText}>Done</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title}>Send</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(5) }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.label}>Asset</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing(1) }}>
            <View style={styles.chips}>
              {tokens.map((t) => {
                const active = t.symbol === symbol;
                return (
                  <Pressable
                    key={t.symbol}
                    onPress={() => setSymbol(t.symbol)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <TokenAvatar symbol={t.symbol} color={t.color} size={24} />
                    <Text style={[styles.chipText, active && { color: colors.bg }]}>{t.symbol}</Text>
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
            <Text style={styles.balance}>
              Balance: {fmtAmount(token.amount)} {symbol}
            </Text>
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
              <Pressable onPress={() => setAmt(String(token.amount))} style={styles.maxBtn}>
                <Text style={styles.maxText}>MAX</Text>
              </Pressable>
              <Text style={styles.symbolTag}>{symbol}</Text>
            </View>
          </View>
          <Text style={[styles.usdLine, over && { color: colors.negative }]}>
            {over ? "Insufficient balance" : `≈ ${usd(usdValue)}`}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <Pressable
          disabled={!valid}
          onPress={() => setSent(true)}
          style={[styles.primaryBtn, !valid && styles.primaryDisabled]}
        >
          <Text style={styles.primaryText}>Review &amp; Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: spacing(3), paddingHorizontal: spacing(6) },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
  },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  label: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    marginBottom: spacing(2),
  },
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
  maxBtn: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.sm,
  },
  maxText: { color: colors.primary, fontSize: font.tiny, fontWeight: "800" },
  symbolTag: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  usdLine: { color: colors.textMuted, fontSize: font.small, marginTop: spacing(2), marginLeft: spacing(1) },
  footer: {
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: colors.cardBorder,
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing(4),
    borderRadius: radius.pill,
    alignItems: "center",
  },
  primaryDisabled: { backgroundColor: colors.card },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  successCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(2),
  },
  successTitle: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  successSub: { color: colors.textMuted, fontSize: font.body },
  mockNote: { color: colors.warning, fontSize: font.small, textAlign: "center", marginTop: spacing(2) },
});
