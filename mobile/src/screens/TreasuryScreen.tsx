import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { PieChart } from "../components/PieChart";
import { fetchHoldings, treasuryAddress, type Holdings } from "../solana/treasury";
import { buildAllocation } from "../solana/allocation";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, type TokenMeta } from "../solana/tokens";
import { solscanAccount, CLUSTER } from "../solana/connection";
import { nativeLogo } from "../config/logos";
import { OFFCHAIN_ASSETS } from "../config/treasuryAssets";
import { fetchOffchainPrices, offchainValue, type OffchainPrices } from "../prices/offchain";
import { compact, colors, font, radius, shortAddress, spacing } from "../theme";

const SOL_LOGO = nativeLogo.solana;

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pctOf = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

export function TreasuryScreen() {
  const insets = useSafeAreaInsets();
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [ocPrices, setOcPrices] = useState<OffchainPrices>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const TREASURY_ADDRESS = treasuryAddress();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchHoldings(treasuryAddress());
      setHoldings(h);
      const mints = h.tokens.map((t) => t.mint);
      const [p, m, oc] = await Promise.all([
        fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
        fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
        fetchOffchainPrices().catch(() => ({}) as OffchainPrices),
      ]);
      setPrices(p);
      setMetas(m);
      setOcPrices(oc);
    } catch {
      /* keep last data on transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { slices, total, solUsd, sortedTokens } = buildAllocation(holdings, prices, metas, ocPrices);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing(4), paddingTop: insets.top + spacing(2), paddingBottom: spacing(10) }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.header}>Treasury</Text>

      <LinearGradient colors={[colors.gradA, colors.gradB]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <View style={styles.cardInner}>
          <Text style={styles.cardLabel}>Total value</Text>
          <Text style={styles.total}>{holdings ? usd(total) : "—"}</Text>
          <View style={styles.addrRow}>
            <Text style={styles.addr}>{shortAddress(TREASURY_ADDRESS, 4, 4)}</Text>
            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(TREASURY_ADDRESS);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              hitSlop={10}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color="#0A0A0C" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <Pressable
        onPress={() => Linking.openURL(solscanAccount(TREASURY_ADDRESS))}
        style={styles.verify}
      >
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.verifyText}>Public & verifiable on-chain — view on Solscan ↗</Text>
      </Pressable>

      {holdings && slices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <View style={styles.chartCard}>
            <PieChart data={slices} centerValue={usd(total)} centerLabel="Total" />
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>Holdings</Text>
      <View style={styles.list}>
        <Holding
          symbol="SOL"
          name="Solana"
          amount={holdings?.sol ?? 0}
          usdValue={solUsd}
          pct={pctOf(solUsd, total)}
          logoURI={SOL_LOGO}
          color={colors.accent}
        />
        {sortedTokens.map(({ t, value }) => {
          const meta = metas[t.mint];
          const price = prices[t.mint]?.usdPrice;
          return (
            <View key={t.mint}>
              <View style={styles.divider} />
              <Holding
                symbol={meta?.symbol ?? t.mint.slice(0, 3)}
                name={meta?.name ?? shortAddress(t.mint, 4, 4)}
                amount={t.amount}
                usdValue={price != null ? value : undefined}
                pct={pctOf(value, total)}
                logoURI={meta?.logoURI}
                color={colors.primary}
              />
            </View>
          );
        })}
        {OFFCHAIN_ASSETS.map((a) => {
          const value = offchainValue(a, ocPrices);
          return (
            <View key={a.label}>
              <View style={styles.divider} />
              <Holding
                symbol={a.category}
                name={a.label}
                usdValue={value}
                pct={pctOf(value, total)}
                color={colors.accent}
                offchainDetail={
                  a.amount != null ? `${a.amount.toLocaleString("en-US")} ${a.unit ?? ""}`.trim() : a.category
                }
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.note}>
        On {CLUSTER}. Balances are read live from the chain — anyone can confirm every
        figure here.
      </Text>
    </ScrollView>
  );
}

function Holding({
  symbol,
  name,
  amount,
  usdValue,
  pct,
  logoURI,
  color,
  offchainDetail,
}: {
  symbol: string;
  name: string;
  amount?: number;
  usdValue?: number;
  pct?: number;
  logoURI?: string;
  color: string;
  /** When set, this is an off-chain asset — show this detail + an "off-chain" tag. */
  offchainDetail?: string;
}) {
  return (
    <View style={styles.row}>
      <TokenAvatar symbol={symbol} color={color} logoURI={logoURI} />
      <View style={styles.mid}>
        <Text style={styles.symbol}>{name}</Text>
        <Text style={styles.sub}>
          {offchainDetail != null ? `${offchainDetail} · off-chain` : `${compact(amount ?? 0)} ${symbol}`}
        </Text>
      </View>
      <View style={styles.rightCol}>
        {usdValue != null && <Text style={styles.value}>{usd(usdValue)}</Text>}
        {pct != null && <Text style={styles.pct}>{pct.toFixed(1)}%</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { color: colors.text, fontSize: font.h1, fontWeight: "900", marginBottom: spacing(4) },
  card: { borderRadius: radius.lg, padding: 1 },
  cardInner: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(2) },
  cardLabel: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  total: { color: "#0A0A0C", fontSize: 40, fontWeight: "900", letterSpacing: -1 },
  addrRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  addr: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  verify: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  verifyText: { color: colors.primary, fontSize: font.small, fontWeight: "600" },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(4),
    marginBottom: spacing(3),
  },
  chartCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4) },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  rightCol: { alignItems: "flex-end" },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  pct: { color: colors.textMuted, fontSize: font.small, fontWeight: "700", marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { color: colors.textFaint, fontSize: font.small, lineHeight: 18, marginTop: spacing(5) },
});
