import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { PieChart } from "../components/PieChart";
import { Holding } from "../components/Holding";
import { fetchHoldings, treasuryAddress, type Holdings } from "../solana/treasury";
import { buildAllocation } from "../solana/allocation";
import { getSupply, getTransferFee, XGO_MINT, type TransferFee } from "../solana/token2022";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, type TokenMeta } from "../solana/tokens";
import { fetchOffchainPrices, offchainValue, type OffchainPrices } from "../prices/offchain";
import { OFFCHAIN_ASSETS } from "../config/treasuryAssets";
import { nativeLogo } from "../config/logos";
import { solscanAccount, IS_MAINNET } from "../solana/connection";
import { colors, compact, font, radius, shortAddress, spacing, usd } from "../theme";

const pctOf = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

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
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [supply, setSupply] = useState<number | null>(null);
  const [fee, setFee] = useState<TransferFee | null>(null);
  const [ocPrices, setOcPrices] = useState<OffchainPrices>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const TREASURY_ADDRESS = treasuryAddress();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [h, s, f] = await Promise.all([
        fetchHoldings(treasuryAddress()),
        getSupply(XGO_MINT),
        getTransferFee(XGO_MINT).catch(() => null),
      ]);
      setHoldings(h);
      setSupply(s);
      setFee(f);
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
      /* keep last data */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The full Global Goshens treasury: on-chain holdings + off-chain silver + dinar.
  const { slices, total: treasuryValue, solUsd, sortedTokens } = buildAllocation(holdings, prices, metas, ocPrices);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

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
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={14} color="#0A0A0C" />
            </Pressable>
          </View>
        </View>
      </LinearGradient>

      <Pressable onPress={() => Linking.openURL(solscanAccount(TREASURY_ADDRESS))} style={styles.verify}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
        <Text style={styles.verifyText}>Public & verifiable on-chain — view on Solscan ↗</Text>
      </Pressable>

      {/* Stat tiles — live on-chain only */}
      <View style={styles.tiles}>
        <StatTile label="Total Supply" value={supply != null ? compact(supply) : "—"} delta="XGO" />
        <StatTile
          label="Transfer Fee"
          value={fee ? `${(fee.bps / 100).toFixed(2)}%` : "—"}
          delta="on every transfer"
        />
      </View>

      {/* Allocation */}
      {holdings && slices.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Allocation</Text>
          <View style={styles.chartCard}>
            <PieChart data={slices} centerValue={usd(treasuryValue)} centerLabel="Total" />
          </View>
        </>
      )}

      {/* Holdings — on-chain + off-chain silver/dinar */}
      <Text style={styles.sectionTitle}>Holdings</Text>
      <View style={styles.list}>
        <Holding
          symbol="SOL"
          name="Solana"
          amount={holdings?.sol ?? 0}
          usdValue={solUsd}
          pct={pctOf(solUsd, treasuryValue)}
          logoURI={nativeLogo.solana}
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
                pct={pctOf(value, treasuryValue)}
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
                pct={pctOf(value, treasuryValue)}
                color={colors.accent}
                icon={a.icon}
                offchainDetail={
                  a.amount != null ? `${a.amount.toLocaleString("en-US")} ${a.unit ?? ""}`.trim() : a.category
                }
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.note}>
        On-chain holdings, XGO supply, and the transfer fee are read live from the chain.
        Off-chain assets (silver, dinar) are stated and live-priced where possible.
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
  addrRow: { flexDirection: "row", alignItems: "center", gap: spacing(2), marginTop: spacing(1) },
  addr: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  verify: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(3) },
  verifyText: { color: colors.primary, fontSize: font.small, fontWeight: "600" },
  tiles: { flexDirection: "row", gap: spacing(2.5), marginTop: spacing(2) },
  tile: { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.cardBorder, borderRadius: radius.md, padding: spacing(3), gap: 2 },
  tileLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700" },
  tileValue: { color: colors.text, fontSize: font.h3, fontWeight: "800" },
  tileDelta: { fontSize: font.tiny, fontWeight: "700" },
  chartCard: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, padding: spacing(4) },
  sectionTitle: {
    color: colors.textMuted,
    fontSize: font.small,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing(6),
    marginBottom: spacing(3),
  },
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { color: colors.textFaint, fontSize: font.small, lineHeight: 18, marginTop: spacing(5) },
});
