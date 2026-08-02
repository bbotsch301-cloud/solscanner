import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { TradingViewChart } from "../components/chart/TradingViewChart";
import { ChartFullScreen } from "../components/ChartFullScreen";
import { PressableScale } from "../components/PressableScale";
import { Skeleton } from "../components/Skeleton";
import { ReceiveSheet } from "../components/ReceiveSheet";
import { nativeLogo } from "../config/logos";
import { useWallet } from "../wallet/WalletContext";
import { fetchCandles, CHART_RANGES, type Candle, type ChartRange } from "../prices/candles";
import { candleSnapshots } from "../cache/screens";
import { cachedLiquidity, MIN_LIQUIDITY_USD } from "../solana/prices";
import { haptics } from "../ui/haptics";
import { amount as fmtAmount, colors, compact, font, radius, spacing, usd as fmtUsd } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

// Last-loaded candles per (chain, asset, range), so switching timeframes / revisiting is instant —
// now persisted to disk (see cache/screens.ts), so it survives a restart too. Candles are the
// slowest thing on this screen to fetch and the most jarring to watch appear from nothing.
const candleCache = candleSnapshots;

export function TokenDetailScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "TokenDetail">>();
  const insets = useSafeAreaInsets();
  const { activeChain, activeAddress, native, assets, refresh: refreshWallet } = useWallet();
  const assetKey = route.params.asset;

  // Resolve the asset from live wallet state (balances stay fresh).
  const view = useMemo(() => {
    if (assetKey === "native") {
      // `balance` stays nullable — collapsing an unloaded balance to 0 made this screen open
      // claiming you hold nothing, which for the native asset is the headline figure.
      return { symbol: native.symbol, name: activeChain.name, decimals: activeChain.decimals, balance: native.balance, usd: native.usd, logoURI: nativeLogo[activeChain.id] as string | undefined, isNative: true, contract: null as string | null };
    }
    const a = assets.find((x) => x.key === assetKey);
    if (!a) return null;
    return {
      symbol: a.symbol,
      name: a.name ?? a.symbol,
      decimals: a.decimals,
      balance: a.balance,
      usd: a.usd,
      logoURI: a.logoURI,
      isNative: false,
      contract: (a.kind === "spl" ? a.mint : a.address) ?? null,
    };
  }, [assetKey, native, assets, activeChain]);

  const [range, setRange] = useState<ChartRange>("1W");
  const cacheKey = `${activeChain.id}:${assetKey}:${range}`;
  const [candles, setCandles] = useState<Candle[]>(() => candleCache.get(`${activeChain.id}:${assetKey}:1W`) ?? []);
  const [loading, setLoading] = useState(() => !candleCache.get(`${activeChain.id}:${assetKey}:1W`));
  const [refreshing, setRefreshing] = useState(false);
  const [scrub, setScrub] = useState<Candle | null>(null); // candle under the crosshair, if any
  const [fullscreen, setFullscreen] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hoisted out of the callback's dep array: an optional chain in there defeats the compiler's
  // memoization check.
  const contract = view?.contract ?? null;
  const copyContract = useCallback(async () => {
    if (!contract) return;
    await Clipboard.setStringAsync(contract);
    haptics.tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [contract]);

  const loadCandles = useCallback(async (): Promise<Candle[]> => {
    if (!view) return [];
    return fetchCandles(
      { chainId: activeChain.id, symbol: view.symbol, isNative: view.isNative, contract: view.contract },
      range
    );
  }, [view, activeChain.id, range]);

  // Show the cached candles for this (token, range) instantly, then refresh behind (stale-while-
  // revalidate) — so switching timeframes is snappy and hits the free chart APIs less.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const cached = candleCache.get(cacheKey);
      const hadData = !!cached && cached.length >= 2;
      if (cached) {
        setCandles(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      const c = await loadCandles();
      if (!cancelled) {
        // Never let a transient empty/rate-limited response wipe a chart that's already on screen —
        // keep the last-good candles and only fall through to the empty state when we've genuinely
        // never had data for this (token, range).
        if (c.length >= 2) {
          setCandles(c);
          candleCache.set(cacheKey, c);
        } else if (!hadData) {
          setCandles([]);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, loadCandles]);

  // Pull-to-refresh: re-price the wallet (updates this token's balance + USD value) and reload
  // the candles for the current range. As above, a transient empty result keeps the last-good chart.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c] = await Promise.all([loadCandles(), refreshWallet()]);
      if (c.length >= 2) {
        setCandles(c);
        candleCache.set(cacheKey, c);
      }
    } catch {
      /* keep last */
    } finally {
      setRefreshing(false);
    }
  }, [loadCandles, refreshWallet, cacheKey]);

  if (!view) {
    return (
      <View style={[styles.screen, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.sub}>This asset isn’t in your wallet on {activeChain.name}.</Text>
        <Pressable onPress={() => nav.goBack()} style={styles.ghostBtn}>
          <Text style={styles.ghostText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  // Live price = wallet-derived per-unit, else the latest candle close. When scrubbing, show the
  // hovered candle's close instead. Range change = first open → last close of the loaded candles.
  const latestClose = candles.length ? candles[candles.length - 1].close : null;
  const livePrice =
    view.balance != null && view.balance > 0 && view.usd != null ? view.usd / view.balance : latestClose;
  const displayPrice = scrub ? scrub.close : livePrice;
  // The wallet's price map doesn't cover every token, but the chart's latest close is a price for
  // exactly this asset — so use it rather than leave "Your balance" showing a permanent skeleton
  // under a screen that's displaying a price at the top.
  const balanceUsd =
    view.usd ?? (view.balance != null && latestClose != null ? view.balance * latestClose : null);
  // Why there's no dollar value, said precisely enough to act on — and to debug.
  //
  // "we measured the pool and it holds $312" and "we never found a pool at all" are completely
  // different situations: the first means the holding is real but unsellable, the second means our
  // price lookup came up empty and may itself be at fault. Both used to render as the same dash,
  // which is how a diagnosis becomes a guessing game.
  const poolLiquidity = view.contract ? cachedLiquidity(view.contract) : undefined;
  const noPriceLabel =
    balanceUsd != null
      ? null
      : poolLiquidity != null && poolLiquidity < MIN_LIQUIDITY_USD
        ? `No market · only $${compact(poolLiquidity)} pooled liquidity`
        : poolLiquidity != null
          // A deep pool with no price is OUR gap, not the token's. Calling that "no market" would
          // be a confidently wrong statement about a token that plainly has one.
          ? `Price unavailable · $${compact(poolLiquidity)} pooled liquidity`
          : view.contract
            ? "No price source found for this token"
            : null; // native asset with no price yet — that's still just loading
  const change =
    candles.length >= 2 && candles[0].open > 0
      ? ((candles[candles.length - 1].close - candles[0].open) / candles[0].open) * 100
      : null;
  const scrubTime = scrub
    ? new Date(scrub.time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
    >
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <TokenAvatar symbol={view.symbol} color={colors.primary} size={28} logoURI={view.logoURI} />
          <Text style={styles.title}>{view.name}</Text>
        </View>
        <Pressable onPress={() => nav.goBack()} hitSlop={12}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <Text style={styles.price}>{displayPrice != null ? fmtUsd(displayPrice) : "—"}</Text>
      {scrubTime ? (
        <Text style={styles.scrubTime}>{scrubTime}</Text>
      ) : (
        change != null && (
          <Text style={[styles.change, { color: change >= 0 ? colors.positive : colors.negative }]}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% · {range}
          </Text>
        )
      )}

      <View style={styles.chartCard}>
        {loading && candles.length < 2 ? (
          <Skeleton width="100%" height={200} round={radius.md} />
        ) : candles.length >= 2 ? (
          <>
            <TradingViewChart candles={candles} height={240} onScrub={setScrub} />
            <PressableScale
              haptic={null}
              onPress={() => {
                haptics.tap();
                setScrub(null);
                setFullscreen(true);
              }}
              style={styles.expandBtn}
              hitSlop={8}
            >
              <Ionicons name="expand" size={18} color={colors.textMuted} />
            </PressableScale>
          </>
        ) : (
          <Text style={styles.sub}>No price chart for this token.</Text>
        )}
      </View>

      <View style={styles.rangeRow}>
        {CHART_RANGES.map((r) => {
          const on = r === range;
          return (
            <PressableScale
              key={r}
              haptic={null}
              onPress={() => {
                if (on) return;
                haptics.select();
                setScrub(null);
                setRange(r);
              }}
              style={[styles.rangePill, on && styles.rangePillOn]}
            >
              <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r}</Text>
            </PressableScale>
          );
        })}
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balLabel}>Your balance</Text>
        {view.balance == null ? (
          <Skeleton width={140} height={26} style={{ marginVertical: spacing(1) }} />
        ) : (
          <Text style={styles.balAmount}>{fmtAmount(view.balance)} {view.symbol}</Text>
        )}
        {balanceUsd != null ? (
          <Text style={styles.balUsd}>{fmtUsd(balanceUsd)}</Text>
        ) : noPriceLabel ? (
          // Not "still loading" — we looked and came back with an answer, just not a price. A
          // skeleton here would pulse forever promising a number that is never going to arrive.
          <Text style={styles.balNoMarket}>{noPriceLabel}</Text>
        ) : (
          <Skeleton width={80} height={15} />
        )}
      </View>

      {/* The contract address, one tap to copy. Anyone sharing a token needs this, and hunting
          for it in an explorer to paste it back into the app was absurd. */}
      {view.contract && (
        <PressableScale haptic={null} onPress={copyContract} style={styles.contractRow}>
          <Ionicons name="document-text-outline" size={16} color={colors.textMuted} />
          <View style={styles.contractMid}>
            <Text style={styles.contractLabel}>Contract address</Text>
            <Text style={styles.contractValue} numberOfLines={1}>{view.contract}</Text>
          </View>
          <Ionicons
            name={copied ? "checkmark" : "copy-outline"}
            size={18}
            color={copied ? colors.positive : colors.textMuted}
          />
        </PressableScale>
      )}

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={() => nav.navigate("Send", { asset: assetKey })}>
          <Ionicons name="arrow-up" size={18} color={colors.bg} />
          <Text style={styles.primaryText}>Send</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => setReceiving(true)}>
          <Ionicons name="arrow-down" size={18} color={colors.primary} />
          <Text style={styles.secondaryText}>Receive</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => nav.navigate("Swap")}>
          <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
          <Text style={styles.secondaryText}>Swap</Text>
        </Pressable>
      </View>

      <ReceiveSheet
        visible={receiving}
        onClose={() => setReceiving(false)}
        address={activeAddress ?? ""}
        chainName={activeChain.name}
        symbol={view.symbol}
      />

      <ChartFullScreen
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        candles={candles}
        loading={loading}
        range={range}
        onRangeChange={(r) => {
          setScrub(null);
          setRange(r);
        }}
        symbol={view.symbol}
        name={view.name}
        logoURI={view.logoURI}
        livePrice={livePrice}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: "center", justifyContent: "center", gap: spacing(4), paddingHorizontal: spacing(6) },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing(4) },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  title: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  price: { color: colors.text, fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  change: { fontSize: font.body, fontWeight: "800", marginTop: spacing(1) },
  scrubTime: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginTop: spacing(1) },
  rangeRow: { flexDirection: "row", gap: spacing(2), marginTop: spacing(3) },
  rangePill: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing(2.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  rangePillOn: { backgroundColor: colors.primary + "22", borderColor: colors.primary },
  rangeText: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
  rangeTextOn: { color: colors.text },
  chartCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    marginTop: spacing(4),
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  expandBtn: {
    position: "absolute",
    top: spacing(2),
    right: spacing(2),
    padding: spacing(1.5),
    borderRadius: radius.sm,
    backgroundColor: colors.bgElevated + "CC",
  },
  balanceCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
    padding: spacing(4),
    marginTop: spacing(4),
    gap: 2,
  },
  balLabel: { color: colors.textMuted, fontSize: font.small, fontWeight: "700" },
  balAmount: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  balUsd: { color: colors.textMuted, fontSize: font.body },
  balNoMarket: { color: colors.warning, fontSize: font.small },
  contractRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    marginTop: spacing(3),
    padding: spacing(4),
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.md,
  },
  contractMid: { flex: 1, gap: 2 },
  contractLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700" },
  contractValue: { color: colors.text, fontSize: font.small, fontWeight: "600" },
  // Three across now (Send / Receive / Swap), so the labels drop a size and the gaps tighten —
  // at h3 with icons they wrapped on a narrow phone.
  actions: { flexDirection: "row", gap: spacing(2), marginTop: spacing(5) },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(1.5), backgroundColor: colors.primary, paddingVertical: spacing(3.5), borderRadius: radius.pill },
  primaryText: { color: colors.bg, fontSize: font.body, fontWeight: "800" },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(1.5), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: spacing(3.5), borderRadius: radius.pill },
  secondaryText: { color: colors.primary, fontSize: font.body, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
  ghostBtn: { paddingVertical: spacing(3), paddingHorizontal: spacing(6), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cardBorder },
  ghostText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
});
