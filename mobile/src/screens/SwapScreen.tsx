import { useNavigation } from "@react-navigation/native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { SWAP_TOKENS, fetchQuote, type Quote, type SwapToken } from "../solana/swap";
import { amount as fmtAmount, colors, font, radius, spacing } from "../theme";
import type { RootNav } from "../navigation";

function TokenPicker({
  selected,
  exclude,
  onSelect,
}: {
  selected: SwapToken;
  exclude: string;
  onSelect: (t: SwapToken) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing(1) }}>
      <View style={styles.chips}>
        {SWAP_TOKENS.filter((t) => t.mint !== exclude).map((t) => {
          const active = t.mint === selected.mint;
          return (
            <Pressable key={t.mint} onPress={() => onSelect(t)} style={[styles.chip, active && styles.chipActive]}>
              <TokenAvatar symbol={t.symbol} color={colors.primary} size={22} logoURI={t.logoURI} />
              <Text style={[styles.chipText, active && { color: colors.bg }]}>{t.symbol}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

export function SwapScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();

  const [from, setFrom] = useState<SwapToken>(SWAP_TOKENS[0]);
  const [to, setTo] = useState<SwapToken>(SWAP_TOKENS[1]);
  const [amt, setAmt] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amtNum = parseFloat(amt) || 0;

  // Debounced live quote from Jupiter (mainnet rates).
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (amtNum <= 0) return;
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const q = await fetchQuote(from, to, amtNum);
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [from, to, amtNum]);

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmt("");
  };

  const rate = quote && amtNum > 0 ? quote.outAmount / amtNum : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <View style={[styles.topBar, { paddingTop: insets.top + spacing(2) }]}>
        <Text style={styles.title}>Swap</Text>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }} keyboardShouldPersistTaps="handled">
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You pay</Text>
          <TokenPicker selected={from} exclude={to.mint} onSelect={setFrom} />
          <TextInput
            value={amt}
            onChangeText={setAmt}
            placeholder="0.0"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            style={styles.amountInput}
          />
        </View>

        <Pressable onPress={flip} style={styles.flipBtn}>
          <Ionicons name="swap-vertical" size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You receive</Text>
          <TokenPicker selected={to} exclude={from.mint} onSelect={setTo} />
          <View style={styles.receiveRow}>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Text style={styles.receiveAmount}>
                {quote ? fmtAmount(quote.outAmount) : "0.0"}
              </Text>
            )}
            <Text style={styles.receiveUnit}>{to.symbol}</Text>
          </View>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {quote && (
          <View style={styles.details}>
            <Row label="Rate" value={rate ? `1 ${from.symbol} ≈ ${fmtAmount(rate)} ${to.symbol}` : "—"} />
            <Row
              label="Price impact"
              value={`${quote.priceImpactPct < 0.01 ? "<0.01" : quote.priceImpactPct.toFixed(2)}%`}
            />
            <Row label="Route" value={quote.routeLabels.join(" → ") || "Direct"} />
          </View>
        )}

        <View style={styles.banner}>
          <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
          <Text style={styles.bannerText}>
            Live mainnet rates via Jupiter. Executing swaps unlocks when the wallet
            moves to mainnet — devnet has no swap liquidity.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        <View style={[styles.primaryBtn, styles.primaryDisabled]}>
          <Text style={styles.primaryTextDisabled}>Swap · available on mainnet</Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(3),
  },
  panelLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  chips: { flexDirection: "row", gap: spacing(2), paddingHorizontal: spacing(1) },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  amountInput: { color: colors.text, fontSize: font.h1, fontWeight: "800", padding: 0 },
  flipBtn: {
    alignSelf: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -spacing(1),
    zIndex: 1,
  },
  receiveRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), minHeight: 40 },
  receiveAmount: { color: colors.text, fontSize: font.h1, fontWeight: "800" },
  receiveUnit: { color: colors.textMuted, fontSize: font.h3, fontWeight: "800" },
  error: { color: colors.negative, fontSize: font.small, paddingHorizontal: spacing(1) },
  details: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(2),
  },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { color: colors.textMuted, fontSize: font.small },
  detailValue: { color: colors.text, fontSize: font.small, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: spacing(4) },
  banner: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.primary + "14",
    borderRadius: radius.md,
    padding: spacing(4),
  },
  bannerText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryTextDisabled: { color: colors.textMuted, fontSize: font.h3, fontWeight: "800" },
});
