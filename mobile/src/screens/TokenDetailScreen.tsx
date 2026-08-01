import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { Sparkline } from "../components/Sparkline";
import { useWallet } from "../wallet/WalletContext";
import { fetchTokenChart, type TokenChart } from "../prices/chart";
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

  const [chart, setChart] = useState<TokenChart | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChart = useCallback(async (): Promise<TokenChart | null> => {
    if (!view) return null;
    return fetchTokenChart({
      chainId: activeChain.id,
      symbol: view.symbol,
      isNative: view.isNative,
      contract: view.contract,
    });
  }, [view, activeChain.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await loadChart();
      if (!cancelled) {
        setChart(c);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadChart]);

  // Pull-to-refresh: re-price the wallet (updates this token's balance + USD value) and reload
  // the chart. fetchPrices/fetchTokenChart aren't cached, so this pulls genuinely fresh numbers.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [c] = await Promise.all([loadChart(), refreshWallet()]);
      setChart(c);
    } catch {
      /* keep last */
    } finally {
      setRefreshing(false);
    }
  }, [loadChart, refreshWallet]);

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

  const perUnit = view.balance > 0 && view.usd != null ? view.usd / view.balance : chart?.priceUsd ?? null;
  const change = chart?.changePct ?? null;

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

      <Text style={styles.price}>{perUnit != null ? fmtUsd(perUnit) : "—"}</Text>
      {change != null && (
        <Text style={[styles.change, { color: change >= 0 ? colors.positive : colors.negative }]}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}% · 7d
        </Text>
      )}

      <View style={styles.chartCard}>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : chart ? (
          <Sparkline data={chart.prices} height={90} />
        ) : (
          <Text style={styles.sub}>No price chart for this token.</Text>
        )}
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
