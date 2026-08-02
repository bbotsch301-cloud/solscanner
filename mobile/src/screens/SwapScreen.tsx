import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import Slider from "@react-native-community/slider";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { ScreenHeader } from "../components/ScreenHeader";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { TokenSelectSheet, type OwnedToken } from "../components/TokenSelectSheet";
import { SWAP_TOKENS, XGO_TOKEN, type SwapToken } from "../solana/swap";
import { evmSwapTokens } from "../evm/tokenList";
import { quoteSwap } from "../swap";
import { EVM_NATIVE, type UnifiedQuote } from "../swap/types";
import { IS_MAINNET } from "../solana/connection";
import { humanizeError } from "../solana/errors";
import { haptics } from "../ui/haptics";
import { nativeLogo } from "../config/logos";
import { SwapConfirmSheet, type SwapPhase } from "../components/SwapConfirmSheet";
import { useWallet } from "../wallet/WalletContext";
import { amount as fmtAmount, colors, compact, font, radius, spacing, usd as fmtUsd } from "../theme";
import type { ChainDef } from "../chains/registry";
import type { RootNav } from "../navigation";

const SLIPPAGE_OPTIONS = [50, 100, 200]; // bps: 0.5% / 1% / 2%
const SOL_MINT_ADDR = "So11111111111111111111111111111111111111112";
const SWAP_SOL_RESERVE = 0.005; // SOL kept back for fee + rent
// Above this, the raw digits no longer fit the amount field and used to render as "429…".
// Below it they fit fine, and rewriting a typed "1000" as "1.0K" would just be annoying.
const COMPACT_FROM = 1_000_000;

/**
 * Native to keep back for gas. Ethereum gas is far pricier than BSC, and an ERC-20
 * swap needs TWO txs (a one-time approval + the swap) vs one for a native-in swap —
 * so token-in reserves more. These are preflight floors; the on-chain error backstops.
 */
function gasReserve(chain: ChainDef, tokenIn: boolean): number {
  const base = chain.id === "ethereum" ? 0.004 : 0.002;
  return tokenIn ? base + (chain.id === "ethereum" ? 0.004 : 0.001) : base;
}

function defaultsFor(chain: ChainDef): [SwapToken, SwapToken] {
  // Solana defaults to SOL → XGO so the swapper opens ready to buy XGO.
  if (chain.kind === "solana") return [SWAP_TOKENS[0], XGO_TOKEN];
  const list = evmSwapTokens(chain.id);
  const usdc = list.find((t) => t.symbol === "USDC") ?? list[1];
  return [list[0], usdc];
}

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

export function SwapScreen({ asTab = false }: { asTab?: boolean }) {
  const nav = useNavigation<RootNav>();
  const insets = useSafeAreaInsets();

  const { activeChain, activeAddress, native, assets, swapExecute, refresh: refreshWallet } = useWallet();
  const isSolana = activeChain.kind === "solana";

  const [from, setFrom] = useState<SwapToken>(() => defaultsFor(activeChain)[0]);
  const [to, setTo] = useState<SwapToken>(() => defaultsFor(activeChain)[1]);
  const [amt, setAmt] = useState("");
  const [slippageBps, setSlippageBps] = useState(100);
  const [quote, setQuote] = useState<UnifiedQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<"from" | "to" | null>(null);
  // Token amounts here run to billions (memecoin balances), which overflowed the input and
  // rendered as "429…" — a number you can't read and can't act on. While the field isn't being
  // edited we show a compact form ("429.86M"); focusing it restores the exact digits to type on.
  const [amtFocused, setAmtFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [phase, setPhase] = useState<SwapPhase>("confirm");
  const [signature, setSignature] = useState<string | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const amtNum = parseFloat(amt) || 0;
  const nativeMint = isSolana ? SOL_MINT_ADDR : EVM_NATIVE;

  // Reset the pair to the active chain's defaults when the chain changes.
  useEffect(() => {
    const [a, b] = defaultsFor(activeChain);
    setFrom(a);
    setTo(b);
    setAmt("");
    setQuote(null);
  }, [activeChain]);

  // Owned assets for the picker (native + tokens on the active chain).
  const owned = useMemo<OwnedToken[]>(() => {
    const list: OwnedToken[] = [
      {
        // The logo matters: picking the native token from the sheet replaces `from`/`to` with THIS
        // object, so omitting it made SOL's mark vanish from the token chip after selection (and
        // show as a letter placeholder in "Your tokens" while every other row had its icon).
        token: {
          mint: nativeMint,
          symbol: native.symbol,
          decimals: activeChain.decimals,
          logoURI: nativeLogo[activeChain.id],
          verified: true,
        },
        balance: native.balance ?? 0,
        usd: native.usd,
      },
      ...assets.map((a) => ({
        token: {
          mint: (a.kind === "spl" ? a.mint : a.address) ?? a.key,
          symbol: a.symbol,
          name: a.name,
          decimals: a.decimals,
          logoURI: a.logoURI,
        },
        balance: a.balance,
        usd: a.usd,
      })),
    ];
    return list;
  }, [native, assets, activeChain.decimals, activeChain.id, nativeMint]);

  const balanceOf = (mint: string): number => owned.find((o) => o.token.mint === mint)?.balance ?? 0;

  // Debounced live quote (Jupiter on Solana, meta-aggregator on EVM).
  useEffect(() => {
    setQuote(null);
    setError(null);
    if (amtNum <= 0) return;
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const q = await quoteSwap(activeChain, from, to, amtNum, slippageBps, activeAddress);
        if (!cancelled) setQuote(q);
      } catch (e) {
        if (!cancelled) setError(humanizeError(e, { action: "swap", symbol: to.symbol, native: native.symbol }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [activeChain, from, to, amtNum, slippageBps, activeAddress, native.symbol]);

  // Pull-to-refresh: re-price owned balances and pull a fresh quote (prices move).
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshWallet();
      if (amtNum > 0) {
        const q = await quoteSwap(activeChain, from, to, amtNum, slippageBps, activeAddress);
        setQuote(q);
        setError(null);
      }
    } catch (e) {
      setError(humanizeError(e, { action: "swap", symbol: to.symbol, native: native.symbol }));
    } finally {
      setRefreshing(false);
    }
  }, [refreshWallet, activeChain, from, to, amtNum, slippageBps, activeAddress, native.symbol]);

  const flip = () => {
    setFrom(to);
    setTo(from);
    setAmt("");
  };

  const rate = quote && amtNum > 0 ? quote.outUi / amtNum : null;

  // Per-unit USD for a token we hold (its priced balance). Used to show the dollar value on both
  // sides of the swap. The output token may not be owned, so its side falls back to the input's
  // dollar value adjusted for price impact (a swap ≈ preserves USD value minus impact/fees).
  const perUnitUsd = (mint: string): number | null => {
    const o = owned.find((x) => x.token.mint === mint);
    return o && o.usd != null && o.balance > 0 ? o.usd / o.balance : null;
  };
  const fromPerUnit = perUnitUsd(from.mint);
  const toPerUnit = perUnitUsd(to.mint);
  // Pay side stays live while typing from the owned price; once a quote returns, its price-feed
  // value (quote.inUsd) backstops an unpriced input. Receive side prefers the quote's true
  // output USD, then an owned price, then an impact-based estimate.
  const payUsd =
    amtNum > 0 && fromPerUnit != null ? amtNum * fromPerUnit : quote?.inUsd ?? null;
  const receiveUsd =
    quote?.outUsd != null
      ? quote.outUsd
      : quote && toPerUnit != null
        ? quote.outUi * toPerUnit
        : quote && payUsd != null
          ? payUsd * (1 - (quote.priceImpactPct || 0) / 100)
          : null;

  // How much of `from` can actually be sold — for native, hold back the gas/rent reserve.
  const sellable = (): number => {
    const bal = balanceOf(from.mint);
    if (from.mint !== nativeMint) return bal;
    const reserve = isSolana ? SWAP_SOL_RESERVE : gasReserve(activeChain, false);
    return Math.max(0, bal - reserve);
  };
  const trimAmt = (n: number): string => (n > 0 ? String(Number(n.toFixed(6))) : "");
  // Set the pay amount to a percentage (0–100) of the sellable balance.
  const setAmtToPct = (pct: number) => setAmt(trimAmt((sellable() * pct) / 100));
  const maxSellable = sellable();
  const sliderPct = maxSellable > 0 ? Math.min(100, (amtNum / maxSellable) * 100) : 0;

  const preflightError = (): string | null => {
    const bal = balanceOf(from.mint);
    const nativeBal = native.balance ?? 0;
    const fromIsNative = from.mint === nativeMint;
    if (isSolana) {
      if (fromIsNative) {
        const need = amtNum + SWAP_SOL_RESERVE;
        if (nativeBal < need)
          return `You have ${fmtAmount(nativeBal)} SOL. Swapping ${fmtAmount(amtNum)} SOL needs about ${fmtAmount(need)} SOL — the extra (~${SWAP_SOL_RESERVE}) covers the network fee and token-account rent.`;
      } else {
        if (amtNum > bal) return `You only have ${fmtAmount(bal)} ${from.symbol}.`;
        if (nativeBal < SWAP_SOL_RESERVE)
          return `You need a little SOL (~${SWAP_SOL_RESERVE}) for the network fee, even when swapping ${from.symbol}.`;
      }
    } else {
      if (fromIsNative) {
        const reserve = gasReserve(activeChain, false);
        const need = amtNum + reserve;
        if (nativeBal < need)
          return `You have ${fmtAmount(nativeBal)} ${native.symbol}. Swapping ${fmtAmount(amtNum)} needs about ${fmtAmount(need)} — the extra (~${reserve}) covers gas.`;
      } else {
        const reserve = gasReserve(activeChain, true);
        if (amtNum > bal) return `You only have ${fmtAmount(bal)} ${from.symbol}.`;
        if (nativeBal < reserve)
          return `You need about ${reserve} ${native.symbol} for gas — swapping ${from.symbol} needs a one-time approval plus the swap.`;
      }
    }
    return null;
  };

  // The confirmation, execution and result all live in one branded sheet now (SwapConfirmSheet)
  // instead of three OS alerts. `doSwap` just runs the preflight guard and opens it.
  const doSwap = () => {
    if (!quote) return;
    const pre = preflightError();
    if (pre) {
      Alert.alert("Can't swap yet", pre);
      return;
    }
    setSheetError(null);
    setSignature(null);
    setPhase("confirm");
    setSheetOpen(true);
  };

  const runSwap = async () => {
    if (!quote) return;
    setPhase("executing");
    setSwapping(true);
    setStatus(null);
    try {
      const sig = await swapExecute(quote, (s) => setStatus(s));
      haptics.success();
      setSignature(sig);
      setPhase("success");
      // Pull balances straight away rather than waiting on the 45s notification poll. This is what
      // spots the incoming side of the trade and fires the "Received" alert — without it the
      // notification lands whenever the timer next happens to run, or not at all if the balance
      // change gets folded into a routine refresh first.
      void refreshWallet();
    } catch (e) {
      haptics.error();
      setSheetError(humanizeError(e, { action: "swap", symbol: from.symbol, native: native.symbol }));
      setPhase("error");
    } finally {
      setSwapping(false);
      setStatus(null);
    }
  };

  const closeSheet = () => {
    const succeeded = phase === "success";
    setSheetOpen(false);
    if (!succeeded) return;
    // As the tab root there's nothing to pop — just clear the form.
    if (asTab) {
      setAmt("");
      setQuote(null);
    } else {
      nav.goBack();
    }
  };

  const canSwap = !isSolana || IS_MAINNET; // EVM is always mainnet

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.screen}>
      <ScreenHeader
        title={`Swap · ${activeChain.name}`}
        size="modal"
        onClose={asTab ? undefined : () => nav.goBack()}
      />

      <ScrollView
        contentContainerStyle={{ padding: spacing(4), gap: spacing(3) }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View style={styles.panel}>
          <View style={styles.panelTop}>
            <Text style={styles.panelLabel}>You pay</Text>
            <Pressable onPress={() => { haptics.select(); setAmtToPct(100); }} hitSlop={8} style={styles.balancePress}>
              <Text style={styles.balanceText} numberOfLines={1}>
                Balance {compact(balanceOf(from.mint))} {from.symbol}
              </Text>
            </Pressable>
          </View>
          <View style={styles.panelRow}>
            <View style={styles.amountCol}>
              <TextInput
                value={amtFocused || amtNum < COMPACT_FROM ? amt : compact(amtNum)}
                onChangeText={setAmt}
                onFocus={() => setAmtFocused(true)}
                onBlur={() => setAmtFocused(false)}
                placeholder="0.0"
                placeholderTextColor={colors.textFaint}
                keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <Text style={styles.usdText}>{payUsd != null ? fmtUsd(payUsd) : "$0.00"}</Text>
            </View>
            <TokenButton token={from} onPress={() => setPickerFor("from")} />
          </View>

          {/* Drag to sell a % of your balance — the amount + its dollar value update live. */}
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={sliderPct}
            onValueChange={setAmtToPct}
            minimumTrackTintColor={colors.primary}
            maximumTrackTintColor={colors.cardBorder}
            thumbTintColor={colors.primary}
            disabled={maxSellable <= 0}
          />
          <View style={styles.pctRow}>
            {[25, 50, 75, 100].map((p) => {
              const on = Math.round(sliderPct) === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => { haptics.select(); setAmtToPct(p); }}
                  style={[styles.pctChip, on && styles.pctChipActive]}
                >
                  <Text style={[styles.pctChipText, on && { color: colors.bg }]}>{p === 100 ? "MAX" : `${p}%`}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Pressable onPress={flip} style={styles.flipBtn}>
          <Ionicons name="swap-vertical" size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.panel}>
          <Text style={styles.panelLabel}>You receive</Text>
          <View style={styles.panelRow}>
            <View style={styles.amountCol}>
              <View style={styles.receiveRow}>
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.receiveAmount} numberOfLines={1} adjustsFontSizeToFit>
                    {quote ? compact(quote.outUi) : "0.0"}
                  </Text>
                )}
              </View>
              <Text style={styles.usdText}>{receiveUsd != null ? `≈ ${fmtUsd(receiveUsd)}` : "$0.00"}</Text>
            </View>
            <TokenButton token={to} onPress={() => setPickerFor("to")} />
          </View>
        </View>

        <Card style={styles.slippageRow}>
          <Text style={styles.detailLabel}>Slippage tolerance</Text>
          <View style={styles.slipChips}>
            {SLIPPAGE_OPTIONS.map((bps) => (
              <Pressable
                key={bps}
                onPress={() => setSlippageBps(bps)}
                style={[styles.slipChip, slippageBps === bps && styles.slipChipActive]}
              >
                <Text style={[styles.slipText, slippageBps === bps && { color: colors.bg }]}>{bps / 100}%</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {error && <Text style={styles.error}>{error}</Text>}

        {quote && (
          <View style={styles.details}>
            <Row label="Rate" value={rate ? `1 ${from.symbol} ≈ ${fmtAmount(rate)} ${to.symbol}` : "—"} />
            <Row label="Price impact" value={`${quote.priceImpactPct < 0.01 ? "<0.01" : quote.priceImpactPct.toFixed(2)}%`} />
            <Row label="Best route via" value={quote.provider} />
            <Row label="Min received" value={`${fmtAmount(quote.minReceivedUi)} ${to.symbol}`} />
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
            {quote.feeAccountSetup && <Row label="Account setup (one-time)" value="~0.002 SOL" />}
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
              {quote.gapBps != null ? ` ${(quote.gapBps / 100).toFixed(2)}%` : ""} — routed to the best price.
            </Text>
          </View>
        )}

        <View style={styles.banner}>
          <Ionicons name="pricetags-outline" size={16} color={colors.primary} />
          <Text style={styles.bannerText}>
            {isSolana
              ? "Live rates via Jupiter. Executing swaps needs mainnet — devnet has no liquidity."
              : "Best rate across aggregators. ERC-20 swaps ask for a one-time approval first."}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing(3) }]}>
        {!canSwap ? (
          <View style={[styles.primaryBtn, styles.primaryDisabled]}>
            <Text style={styles.primaryTextDisabled}>Swap · available on mainnet</Text>
          </View>
        ) : swapping ? (
          // Keep the live status ("Approving…", "Submitting…") beside the spinner while swapping.
          <View style={[styles.primaryBtn, styles.primaryEnabled]}>
            <View style={styles.swappingRow}>
              <ActivityIndicator color={colors.bg} />
              {status && <Text style={styles.swappingText}>{status}</Text>}
            </View>
          </View>
        ) : (
          <Button label={quote ? "Swap" : "Enter an amount"} onPress={doSwap} disabled={!quote} />
        )}
      </View>

      <TokenSelectSheet
        visible={pickerFor !== null}
        onClose={() => setPickerFor(null)}
        onSelect={(t) => {
          if (pickerFor === "from") {
            if (t.mint === to.mint) setTo(from);
            setFrom(t);
          } else if (pickerFor === "to") {
            if (t.mint === from.mint) setFrom(to);
            setTo(t);
          }
        }}
        exclude={pickerFor === "from" ? to.mint : from.mint}
        owned={owned}
        chain={activeChain}
      />

      <SwapConfirmSheet
        visible={sheetOpen}
        phase={phase}
        quote={quote}
        payAmount={amtNum}
        slippageBps={slippageBps}
        payUsd={payUsd}
        receiveUsd={receiveUsd}
        status={status}
        signature={signature}
        errorText={sheetError}
        explorerUrl={signature ? activeChain.explorerTx(signature) : null}
        onConfirm={runSwap}
        onClose={closeSheet}
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
  panel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), gap: spacing(3) },
  panelLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", flexShrink: 0 },
  panelTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  balancePress: { flexShrink: 1, marginLeft: spacing(3) },
  balanceText: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  panelRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  amountCol: { flex: 1, gap: 2 },
  usdText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
  slider: { width: "100%", height: 32 },
  pctRow: { flexDirection: "row", gap: spacing(2) },
  pctChip: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingVertical: spacing(1.5),
    borderRadius: radius.pill,
  },
  pctChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pctChipText: { color: colors.text, fontSize: font.small, fontWeight: "800" },
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
  amountInput: { width: "100%", color: colors.text, fontSize: font.h1, fontWeight: "800", padding: 0 },
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
  receiveRow: { flexDirection: "row", alignItems: "center", minHeight: 40 },
  receiveAmount: { flex: 1, color: colors.text, fontSize: font.h1, fontWeight: "800" },
  error: { color: colors.negative, fontSize: font.small, paddingHorizontal: spacing(1) },
  details: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(4), gap: spacing(2) },
  slippageRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slipChips: { flexDirection: "row", gap: spacing(2) },
  slipChip: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5), borderRadius: radius.pill },
  slipChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  slipText: { color: colors.text, fontSize: font.small, fontWeight: "700" },
  detailRow: { flexDirection: "row", justifyContent: "space-between" },
  detailLabel: { color: colors.textMuted, fontSize: font.small },
  detailValue: { color: colors.text, fontSize: font.small, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: spacing(4) },
  venueTreasury: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.accent + "18", borderRadius: radius.md, padding: spacing(4) },
  venueTreasuryText: { flex: 1, color: colors.accent, fontSize: font.small, lineHeight: 18 },
  venueFallback: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.warning + "18", borderRadius: radius.md, padding: spacing(4) },
  venueFallbackText: { flex: 1, color: colors.warning, fontSize: font.small, lineHeight: 18 },
  banner: { flexDirection: "row", gap: spacing(2), backgroundColor: colors.primary + "14", borderRadius: radius.md, padding: spacing(4) },
  bannerText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  footer: { paddingHorizontal: spacing(4), paddingTop: spacing(3), borderTopWidth: 1, borderTopColor: colors.cardBorder },
  primaryBtn: { paddingVertical: spacing(4), borderRadius: radius.pill, alignItems: "center", minHeight: 52, justifyContent: "center" },
  primaryDisabled: { backgroundColor: colors.card },
  primaryTextDisabled: { color: colors.textMuted, fontSize: font.h3, fontWeight: "800" },
  primaryEnabled: { backgroundColor: colors.primary },
  swappingRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  swappingText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
});
