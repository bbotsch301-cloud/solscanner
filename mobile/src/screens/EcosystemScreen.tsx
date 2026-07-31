import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { fetchHoldings, TREASURY_ADDRESS, type Holdings } from "../solana/treasury";
import { getSupply, getTransferFee, XGO_MINT, type TransferFee } from "../solana/token2022";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, type TokenMeta } from "../solana/tokens";
import { IS_MAINNET } from "../solana/connection";
import { colors, compact, font, radius, spacing, usd } from "../theme";

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

function StatTile({ label, value, delta, deltaUp }: { label: string; value: string; delta?: string; deltaUp?: boolean }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
      {delta && <Text style={[styles.tileDelta, { color: deltaUp ? colors.positive : colors.textMuted }]}>{delta}</Text>}
    </View>
  );
}

export function EcosystemScreen() {
  const insets = useSafeAreaInsets();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = useNavigation<any>();
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [supply, setSupply] = useState<number | null>(null);
  const [fee, setFee] = useState<TransferFee | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, f] = await Promise.all([
        fetchHoldings(TREASURY_ADDRESS),
        getSupply(XGO_MINT),
        getTransferFee(XGO_MINT).catch(() => null),
      ]);
      setHoldings(h);
      setSupply(s);
      setFee(f);
      const mints = h.tokens.map((t) => t.mint);
      const [p, m] = await Promise.all([
        fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
        fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
      ]);
      setPrices(p);
      setMetas(m);
    } catch {
      /* keep last data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const treasuryValue =
    (holdings?.sol ?? 0) * (prices[WSOL_MINT]?.usdPrice ?? 0) +
    (holdings?.tokens ?? []).reduce((s, t) => s + t.amount * (prices[t.mint]?.usdPrice ?? 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const topAssets = [
    { key: "SOL", symbol: "SOL", name: "Solana", amount: holdings?.sol ?? 0, logoURI: SOL_LOGO, usdValue: (holdings?.sol ?? 0) * (prices[WSOL_MINT]?.usdPrice ?? 0) },
    ...(holdings?.tokens ?? []).map((t) => ({
      key: t.mint,
      symbol: metas[t.mint]?.symbol ?? t.mint.slice(0, 3),
      name: metas[t.mint]?.name ?? t.mint.slice(0, 4),
      amount: t.amount,
      logoURI: metas[t.mint]?.logoURI,
      usdValue: t.amount * (prices[t.mint]?.usdPrice ?? 0),
    })),
  ]
    .sort((a, b) => b.usdValue - a.usdValue)
    .slice(0, 4);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.greet}>{greeting}</Text>
      <Text style={styles.greetSub}>Building a Better Tomorrow Together</Text>

      {IS_MAINNET && (
        <View style={styles.soonBanner}>
          <Ionicons name="rocket-outline" size={16} color={colors.primary} />
          <Text style={styles.soonText}>
            The exchange is live. XGO treasury, supply, and governance activate when
            XGO launches on mainnet.
          </Text>
        </View>
      )}

      {/* Treasury value hero */}
      <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroInner}>
          <Text style={styles.heroLabel}>XGO Treasury Value</Text>
          <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
            {holdings ? usd(treasuryValue) : "—"}
          </Text>
          <Text style={styles.heroSub}>The mission, on-chain and verifiable</Text>
        </View>
      </LinearGradient>

      {/* Stat tiles — live on-chain only */}
      <View style={styles.tiles}>
        <StatTile label="Total Supply" value={supply != null ? compact(supply) : "—"} delta="XGO" />
        <StatTile
          label="Transfer Fee"
          value={fee ? `${(fee.bps / 100).toFixed(2)}%` : "—"}
          delta="on every transfer"
        />
      </View>

      {/* Treasury assets preview */}
      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>Treasury Assets</Text>
        <Pressable onPress={() => nav.navigate("Treasury")}>
          <Text style={styles.viewAll}>View all →</Text>
        </Pressable>
      </View>
      <View style={styles.list}>
        {topAssets.map((a, i) => (
          <View key={a.key}>
            {i > 0 && <View style={styles.divider} />}
            <View style={styles.row}>
              <TokenAvatar symbol={a.symbol} color={colors.primary} logoURI={a.logoURI} />
              <View style={styles.mid}>
                <Text style={styles.symbol}>{a.name}</Text>
                <Text style={styles.sub}>{compact(a.amount)} {a.symbol}</Text>
              </View>
              {a.usdValue > 0 && <Text style={styles.value}>{usd(a.usdValue)}</Text>}
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.note}>
        Everything here is read live on-chain — treasury holdings, XGO supply, and the
        transfer fee.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  greet: { color: colors.text, fontSize: font.h2, fontWeight: "800" },
  greetSub: { color: colors.accent, fontSize: font.small, marginTop: 2, marginBottom: spacing(4), fontWeight: "600" },
  soonBanner: { flexDirection: "row", gap: spacing(2), alignItems: "flex-start", backgroundColor: colors.primary + "14", borderRadius: radius.md, padding: spacing(3.5), marginBottom: spacing(4) },
  soonText: { flex: 1, color: colors.primary, fontSize: font.small, lineHeight: 18 },
  hero: { borderRadius: radius.lg, padding: 1 },
  heroInner: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(1) },
  heroLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.5 },
  heroValue: { color: "#0A0A0C", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  heroSub: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "600" },
  tiles: { flexDirection: "row", gap: spacing(2.5), marginTop: spacing(3) },
  tile: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(3), gap: 2 },
  tileLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700" },
  tileValue: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  tileDelta: { fontSize: font.tiny, fontWeight: "700" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing(6), marginBottom: spacing(3) },
  sectionTitle: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  viewAll: { color: colors.primary, fontSize: font.small, fontWeight: "700" },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { color: colors.textFaint, fontSize: font.small, lineHeight: 18, marginTop: spacing(5) },
});
