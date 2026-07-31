import * as Clipboard from "expo-clipboard";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { TokenAvatar } from "../components/TokenAvatar";
import { fetchHoldings, TREASURY_ADDRESS, type Holdings } from "../solana/treasury";
import { fetchPrices, WSOL_MINT, type PriceInfo } from "../solana/prices";
import { fetchTokenMetas, type TokenMeta } from "../solana/tokens";
import { solscanAccount, CLUSTER } from "../solana/connection";
import { amount as fmtAmount, colors, font, radius, shortAddress, spacing } from "../theme";

const SOL_LOGO =
  "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export function TreasuryScreen() {
  const insets = useSafeAreaInsets();
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [metas, setMetas] = useState<Record<string, TokenMeta>>({});
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const h = await fetchHoldings(TREASURY_ADDRESS);
      setHoldings(h);
      const mints = h.tokens.map((t) => t.mint);
      const [p, m] = await Promise.all([
        fetchPrices([WSOL_MINT, ...mints]).catch(() => ({}) as Record<string, PriceInfo>),
        fetchTokenMetas(mints).catch(() => ({}) as Record<string, TokenMeta>),
      ]);
      setPrices(p);
      setMetas(m);
    } catch {
      /* keep last data on transient errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const solUsd = (holdings?.sol ?? 0) * (prices[WSOL_MINT]?.usdPrice ?? 0);
  const tokensUsd = (holdings?.tokens ?? []).reduce(
    (s, t) => s + t.amount * (prices[t.mint]?.usdPrice ?? 0),
    0
  );
  const total = solUsd + tokensUsd;

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

      <Text style={styles.sectionTitle}>Holdings</Text>
      <View style={styles.list}>
        <Holding
          symbol="SOL"
          name="Solana"
          amount={holdings?.sol ?? 0}
          usdValue={solUsd}
          logoURI={SOL_LOGO}
          color={colors.accent}
        />
        {(holdings?.tokens ?? [])
          .slice()
          .sort((a, b) => b.amount * (prices[b.mint]?.usdPrice ?? 0) - a.amount * (prices[a.mint]?.usdPrice ?? 0))
          .map((t) => {
            const meta = metas[t.mint];
            const price = prices[t.mint]?.usdPrice;
            return (
              <View key={t.mint}>
                <View style={styles.divider} />
                <Holding
                  symbol={meta?.symbol ?? t.mint.slice(0, 3)}
                  name={meta?.name ?? shortAddress(t.mint, 4, 4)}
                  amount={t.amount}
                  usdValue={price != null ? t.amount * price : undefined}
                  logoURI={meta?.logoURI}
                  color={colors.primary}
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
  logoURI,
  color,
}: {
  symbol: string;
  name: string;
  amount: number;
  usdValue?: number;
  logoURI?: string;
  color: string;
}) {
  return (
    <View style={styles.row}>
      <TokenAvatar symbol={symbol} color={color} logoURI={logoURI} />
      <View style={styles.mid}>
        <Text style={styles.symbol}>{name}</Text>
        <Text style={styles.sub}>{fmtAmount(amount)} {symbol}</Text>
      </View>
      {usdValue != null && <Text style={styles.value}>{usd(usdValue)}</Text>}
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
  list: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.cardBorder, paddingHorizontal: spacing(4) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(3), paddingVertical: spacing(3) },
  mid: { flex: 1, gap: 2 },
  symbol: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  sub: { color: colors.textMuted, fontSize: font.small },
  value: { color: colors.text, fontSize: font.h3, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.cardBorder },
  note: { color: colors.textFaint, fontSize: font.small, lineHeight: 18, marginTop: spacing(5) },
});
