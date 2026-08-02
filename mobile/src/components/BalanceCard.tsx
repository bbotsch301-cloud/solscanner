/**
 * The wallet hero: what everything you hold is worth, across every chain.
 *
 * It used to lead with one chain's native balance ("0.219 SOL") and show the USD underneath —
 * which meant someone holding SOL and ETH read a headline that was a fraction of their wallet,
 * with nothing saying so. The list beneath is cross-chain now, so the hero is a total.
 */
import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { Skeleton } from "./Skeleton";
import { colors, font, radius, spacing } from "../theme";

export function BalanceCard({
  totalUsd,
  loaded,
  unpricedCount = 0,
  network,
  onTestNetwork,
}: {
  /** Whole-wallet USD, or null when we can't know it yet — never render null as $0.00. */
  totalUsd: number | null;
  /** True once at least one chain has answered. Before that: skeletons, not zeros. */
  loaded: boolean;
  /** Held assets with no price. The total is then a floor, and says so with a "+". */
  unpricedCount?: number;
  /** The active chain's name, for the pill. Which chain Send/Swap will act on. */
  network: string;
  /** True on Solana's test network, where every number here is play money. */
  onTestNetwork?: boolean;
}) {
  const usd =
    totalUsd != null
      ? totalUsd.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : null;

  return (
    <LinearGradient
      colors={[colors.gradA, colors.gradB]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.overlay}>
        <View style={styles.row}>
          <Text style={styles.label}>Total balance</Text>
          {/* Silent about the network in the normal case — the pill just names the active chain,
              which is the one Send and Swap will use. On the test network the numbers here are
              fake, and that IS worth shouting about, so the pill becomes a warning instead. */}
          <View style={[styles.netPill, onTestNetwork && styles.netPillWarn]}>
            <View style={[styles.dot, onTestNetwork && { backgroundColor: colors.warning }]} />
            <Text style={[styles.netText, onTestNetwork && { color: colors.warning }]}>
              {onTestNetwork ? "TEST NETWORK" : network}
            </Text>
          </View>
        </View>

        {!loaded || usd == null ? (
          <>
            <Skeleton width={200} height={44} round={radius.sm} style={{ backgroundColor: "#0A0A0C33", marginVertical: spacing(1) }} />
            <Skeleton width={120} height={16} round={radius.sm} style={{ backgroundColor: "#0A0A0C33" }} />
          </>
        ) : (
          <>
            {/* No spinner in here. Pull-to-refresh already shows one in the space it opens up
                above, and a second one beside the balance was the same status said twice. */}
            <View style={styles.amountRow}>
              <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
                {usd}
              </Text>
            </View>
            <Text style={styles.sub}>
              {unpricedCount > 0
                ? `Across your networks · ${unpricedCount} ${unpricedCount === 1 ? "asset" : "assets"} unpriced`
                : "Across your networks"}
            </Text>
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 1 },
  overlay: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  total: { color: "#0A0A0C", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  sub: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  netPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: "#0A0A0C22",
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#0A0A0C" },
  netText: { color: "#0A0A0C", fontSize: font.tiny, fontWeight: "800" },
  // On the gold hero, the usual warning amber would disappear — so the test-network pill goes
  // dark-on-gold instead, which reads as loudly here as amber does elsewhere.
  netPillWarn: { backgroundColor: "#0A0A0C" },
});
