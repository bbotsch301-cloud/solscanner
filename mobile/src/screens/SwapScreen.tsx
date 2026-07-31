import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { TokenSelectSheet, type OwnedToken } from "../components/TokenSelectSheet";
import { SWAP_TOKENS, executeSwap, fetchQuote, type Quote, type SwapToken } from "../solana/swap";
import { IS_MAINNET, solscanTx } from "../solana/connection";
import { humanizeError } from "../solana/errors";
import { useWallet } from "../wallet/WalletContext";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";
import type { RootNav } from "../navigation";

const SLIPPAGE_OPTIONS = [50, 100, 200]; // bps: 0.5% / 1% / 2%
const SOL_MINT_ADDR = "So11111111111111111111111111111111111111112";
// SOL to keep back for the network fee + token-account rent a swap may create.
const SWAP_SOL_RESERVE = 0.005;

/** The token chip that opens the full selector sheet. */
function TokenButton({ token, onPress }: { token: SwapToken; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tokenBtn, pressed && { opacity: 0.6 }]}>
      <TokenAvatar symbol={token.symbol} color={colors.primary} size={24} logoURI={token.logoURI} />
      <Text style={styles.tokenBtnText}>{token.symbol}</Text>
      <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
    </Pressable>
  );
}

export function SwapScreen() {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();

  const { keypair, solBalance, tokens, priceOf } = useWallet();
  const [from, setFrom] = useState<SwapToken>(SWAP_TOKENS[0]);
  const [to, setTo] = useState<SwapToken>(SWAP_TOKENS[1]);
  const [amt, setAmt] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);

  const amtNum = parseFloat(amt) || 0;

  // Wallet-owned tokens (SOL + SPL), richest first, for the picker's "Your tokens".
  const owned = useMemo<OwnedToken[]>(() => {
    const list: OwnedToken[] = [];
    const solUsd = priceOf(SOL_MINT_ADDR);
    if (solBalance != null && solBalance > 0) {
      list.push({
        token: { mint: SOL_MINT_ADDR, symbol: "SOL", name: "Solana", decimals: 9, logoURI: SWAP_TOKENS[0].logoURI, verified: true },
        balance: solBalance,
        usd: solUsd != null ? solBalance * solUsd : null,
      });
    }
    for (const t of tokens) {
      const p = priceOf(t.mint);
      list.push({
        token: {
          mint: t.mint,
          symbol: t.symbol ?? shortAddress(t.mint, 4, 4),
          name: t.name,
          decimals: t.decimals,
          logoURI: t.logoURI,
        },
        balance: t.amount,
        usd: p != null ? t.amount * p : null,
      });
    }
    return list.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  }, [solBalance, tokens, priceOf]);

  const onSelectToken = (t: SwapToken) => {
    if (pickerFor === "from") {
      if (t.mint === to.mint) setTo(from); // picked the other side → flip it
      setFrom(t);
    } else if (pickerFor === "to") {
      if (t.mint === from.mint) setFrom(to);
      setTo(t);
    }
  };

  // Debounced live quote from Jupiter (mainnet rates).
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (amtNum <= 0) return;
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const q = await fetchQuote(from, to, amtNum, slippageBps);
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) setError(humanizeError(e, { action: "swap", symbol: to.symbol }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [from, to, amtNum, slippageBps]);

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmt("");
  };

  const rate = quote && amtNum > 0 ? quote.outAmount / amtNum : null;

  // Fast, specific check before we ever build/sign — so the common "not enough SOL"
  // case shows real numbers instead of a cryptic on-chain simulation failure.
  const preflightError = (): string | null => {
    const sol = solBalance ?? 0;
    if (from.mint === SOL_MINT_ADDR) {
      const need = amtNum + SWAP_SOL_RESERVE;
      if (sol < need)
        return `You have ${fmtAmount(sol)} SOL. Swapping ${fmtAmount(amtNum)} SOL needs about ${fmtAmount(need)} SOL — the extra (~${SWAP_SOL_RESERVE}) covers the network fee and token-account rent. Add SOL or lower the amount.`;
    } else {
      const bal = tokens.find((t) => t.mint === from.mint)?.amount ?? 0;
      if (amtNum > bal) return `You only have ${fmtAmount(bal)} ${from.symbol}. Lower the amount.`;
      if (sol < SWAP_SOL_RESERVE)
        return `You need a little SOL (about ${SWAP_SOL_RESERVE}) to pay the network fee, even when swapping ${from.symbol}. Add some SOL and try again.`;
    }
    return null;
  };

  const doSwap = () => {
    if (!quote || !keypair) return;
    const pre = preflightError();
    if (pre) {
      Alert.alert("Can't swap yet", pre);
      return;
    }
    Alert.alert(
      "Confirm swap",
      `Swap ${amtNum} ${from.symbol} for about ${fmtAmount(quote.outAmount)} ${to.symbol}? This uses real funds.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Swap",
          onPress: async () => {
            setSwapping(true);
            try {
              const sig = await executeSwap(quote.raw, keypair);
              Alert.alert("Swap submitted", "Your swap is confirmed.", [
                { text: "View on Solscan", onPress: () => Linking.openURL(solscanTx(sig)) },
                { text: "Done", onPress: () => nav.goBack() },
              ]);
            } catch (e) {
              Alert.alert("Swap failed", humanizeError(e, { action: "swap", symbol: from.symbol }));
            } finally {
              setSwapping(false);
            }
          },
        },
      ]
    );
  };

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
          <View style={styles.panelRow}>
            <TextInput
              value={amt}
              onChangeText={setAmt}
              placeholder="0.0"
              placeholderTextColor={colors.textFaint}
              keyboardType="decimal-pad"
              style={styles.amountInput}
            />
            <TokenButton token={from} onPress={() => setPickerFor("from")} />
          </View>
        </View>

        <Pressable onPress={flip} style={styles.flipBtn}>
          <Ionicons name="swap-vertical" size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You receive</Text>
          <View style={styles.panelRow}>
            <View style={styles.receiveRow}>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.receiveAmount} numberOfLines={1} adjustsFontSizeToFit>
                  {quote ? fmtAmount(quote.outAmount) : "0.0"}
                </Text>
              )}
            </View>
            <TokenButton token={to} onPress={() => setPickerFor("to")} />
          </View>
        </View>

        <View style={styles.slippageRow}>
          <Text style={styles.detailLabel}>Slippage tolerance</Text>
          <View style={styles.slipChips}>
            {SLIPPAGE_OPTIONS.map((bps) => (
              <Pressable
                key={bps}
                onPress={() => setSlippageBps(bps)}
                style={[styles.slipChip, slippageBps === bps && styles.slipChipActive]}
              >
                <Text style={[styles.slipText, slippageBps === bps && { color: colors.bg }]}>
                  {bps / 100}%
                </Text>
              </Pressable>
            ))}
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
            <Row
              label="Community fee"
              value={
                quote.isTreasuryPair
                  ? "Free (XGO)"
                  : quote.feeBps > 0
                    ? `${(quote.feeBps / 100).toFixed(2)}% → treasury`
                    : "None"
              }
            />
            <View style={styles.feeDivider} />
            <Row label="Network fee" value="~0.000005 SOL" />
          </View>
        )}

        {quote?.venue === "treasury" && (
          <View style={styles.venueTreasury}>
            <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
            <Text style={styles.venueTreasuryText}>
              Routed through the XGO treasury pool — trading fees flow back to the treasury.
            </Text>
          </View>
        )}
        {quote?.isTreasuryPair && quote.fellBack && (
          <View style={styles.venueFallback}>
            <Ionicons name="git-branch-outline" size={16} color={colors.warning} />
            <Text style={styles.venueFallbackText}>
              Treasury pool price was off by
              {quote.gapBps != null ? ` ${(quote.gapBps / 100).toFixed(2)}%` : ""} — routed
              to the best available price to protect your trade.
            </Text>
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
        {IS_MAINNET ? (
          <Pressable
            disabled={!quote || swapping}
            onPress={doSwap}
            style={[styles.primaryBtn, styles.primaryEnabled, (!quote || swapping) && styles.primaryDim]}
          >
            {swapping ? (
              <ActivityIndicator color={colors.bg} />
            ) : (
              <Text style={styles.primaryTextEnabled}>{quote ? "Swap" : "Enter an amount"}</Text>
            )}
          </Pressable>
        ) : (
          <View style={[styles.primaryBtn, styles.primaryDisabled]}>
            <Text style={styles.primaryTextDisabled}>Swap · available on mainnet</Text>
          </View>
        )}
      </View>

      <TokenSelectSheet
        visible={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onSelect={onSelectToken}
        exclude={pickerFor === "from" ? to.mint : from.mint}
        owned={owned}
      />
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
  panelRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  tokenBtn: {
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
  tokenBtnText: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  amountInput: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800", padding: 0 },
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
  receiveRow: { flex: 1, flexDirection: "row", alignItems: "center", minHeight: 40 },
  receiveAmount: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800" },
  error: { color: colors.negative, fontSize: font.small, paddingHorizontal: spacing(1) },
  details: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(2),
  },
  slippageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slipChips: { flexDirection: "row", gap: spacing(2) },
  slipChip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.pill },
  slipChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slipText: { color: colors.text, fontSize: font.small, fontWeight: "700" },
  feeDivider: { height: 1, backgroundColor: colors.cardBorder, marginVertical: spacing(1) },
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
  venueTreasury: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.accent + "18",
    borderRadius: radius.md,
    padding: spacing(4),
  },
  venueTreasuryText: { flex: 1, color: colors.accent, fontSize: font.small, lineHeight: 18 },
  venueFallback: {
    flexDirection: "row",
    gap: spacing(2),
    backgroundColor: colors.warning + "18",
    borderRadius: radius.md,
    padding: spacing(4),
  },
  venueFallbackText: { flex: 1, color: colors.warning, fontSize: font.small, lineHeight: 18 },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryTextDisabled: { color: colors.textMuted, fontSize: font.h3, fontWeight: "800" },
  primaryEnabled: { backgroundColor: colors.primary },
  primaryDim: { opacity: 0.5 },
  primaryTextEnabled: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
});
