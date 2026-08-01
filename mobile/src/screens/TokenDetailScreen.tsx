import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { CandleChart } from "../components/CandleChart";
import { PressableScale } from "../components/PressableScale";
import { useWallet } from "../wallet/WalletContext";
import { fetchCandles, CHART_RANGES, type Candle, type ChartRange } from "../prices/candles";
import { haptics } from "../ui/haptics";
import { amount as fmtAmount, colors, font, radius, spacing, usd as fmtUsd } from "../theme";
import type { RootNav, RootStackParamList } from "../navigation";

export function TokenDetailScreen() {
  const nav = useNavigation<RootNav>();
  const route = useRoute<RouteProp<RootStackParamList, "TokenDetail">>();
  const insets = useSafeAreaInsets();
  const { activeChain, native, assets, refresh: refreshWallet } = useWallet();
  const assetKey = route.params.asset;

  // Resolve the asset from live wallet state (balances stay fresh).
  const view = useMemo(() => {
    if (assetKey === "native") {
      return { symbol: native.symbol, name: activeChain.name, decimals: activeChain.decimals, balance: native.balance ?? 0, usd: native.usd, logoURI: undefined as string | undefined, isNative: true, contract: null as string | null };
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
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scrub, setScrub] = useState<Candle | null>(null); // candle under the crosshair, if any

  const loadCandles = useCallback(async (): Promise<Candle[]> => {
    if (!view) return [];
    return fetchCandles(
      { chainId: activeChain.id, symbol: view.symbol, isNative: view.isNative, contract: view.contract },
      range
    );
  }, [view, activeChain.id, range]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const c = await loadCandles();
      if (!cancelled) {
        setCandles(c);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadCandles]);

  // Pull-to-refresh: re-price the wallet (updates this token's balance + USD value) and reload
  // the candles for the current range.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c] = await Promise.all([loadCandles(), refreshWallet()]);
      setCandles(c);
    } catch {
      /* keep last */
    } finally {
      setRefreshing(false);
    }
  }, [loadCandles, refreshWallet]);

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
  const livePrice = view.balance > 0 && view.usd != null ? view.usd / view.balance : latestClose;
  const displayPrice = scrub ? scrub.close : livePrice;
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
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : candles.length >= 2 ? (
          <CandleChart candles={candles} height={220} onScrub={setScrub} />
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
        <Text style={styles.balAmount}>{fmtAmount(view.balance)} {view.symbol}</Text>
        {view.usd != null && <Text style={styles.balUsd}>{fmtUsd(view.usd)}</Text>}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primaryBtn} onPress={() => nav.navigate("Send", { asset: assetKey })}>
          <Ionicons name="arrow-up" size={18} color={colors.bg} />
          <Text style={styles.primaryText}>Send</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => nav.navigate("Swap")}>
          <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
          <Text style={styles.secondaryText}>Swap</Text>
        </Pressable>
      </View>
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
  actions: { flexDirection: "row", gap: spacing(3), marginTop: spacing(5) },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.primary, paddingVertical: spacing(4), borderRadius: radius.pill },
  primaryText: { color: colors.bg, fontSize: font.h3, fontWeight: "800" },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2), backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, paddingVertical: spacing(4), borderRadius: radius.pill },
  secondaryText: { color: colors.primary, fontSize: font.h3, fontWeight: "800" },
  sub: { color: colors.textMuted, fontSize: font.body, textAlign: "center" },
  ghostBtn: { paddingVertical: spacing(3), paddingHorizontal: spacing(6), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cardBorder },
  ghostText: { color: colors.text, fontSize: font.body, fontWeight: "700" },
});
