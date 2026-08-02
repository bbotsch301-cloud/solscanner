import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Skeleton } from "./Skeleton";
import { colors, font, radius, shortAddress, spacing } from "../theme";

export function BalanceCard({
  solBalance,
  address,
  network,
  onTestNetwork,
  refreshing,
  usdValue,
  change24h,
  symbol = "SOL",
}: {
  solBalance: number | null;
  address: string;
  /** The chain's name — "Solana", "Ethereum", "BNB Smart Chain". Not the network. */
  network: string;
  /** True on Solana's test network, where every number above is play money. */
  onTestNetwork?: boolean;
  refreshing?: boolean;
  usdValue?: number | null;
  change24h?: number | null;
  symbol?: string;
}) {
  const usd =
    usdValue != null
      ? usdValue.toLocaleString("en-US", { style: "currency", currency: "USD" })
      : null;
  const change =
    change24h != null
      ? `${change24h >= 0 ? "▲" : "▼"} ${Math.abs(change24h).toFixed(2)}%`
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
          <Text style={styles.label}>Balance</Text>
          {/* Silent about the network in the normal case — the pill just names the chain. On the
              test network the balances above are fake, and that IS worth shouting about, so the
              pill becomes a warning instead. Solana-only: the EVM chains have no test mode here. */}
          <View style={[styles.netPill, onTestNetwork && styles.netPillWarn]}>
            <View style={[styles.dot, onTestNetwork && { backgroundColor: colors.warning }]} />
            <Text style={[styles.netText, onTestNetwork && { color: colors.warning }]}>
              {onTestNetwork ? "TEST NETWORK" : network}
            </Text>
          </View>
        </View>

        {solBalance == null ? (
          <>
            <Skeleton width={180} height={44} round={radius.sm} style={{ backgroundColor: "#0A0A0C33", marginVertical: spacing(1) }} />
            <Skeleton width={110} height={16} round={radius.sm} style={{ backgroundColor: "#0A0A0C33" }} />
          </>
        ) : (
          <>
            <View style={styles.amountRow}>
              <Text style={styles.total}>{solBalance.toLocaleString("en-US", { maximumFractionDigits: 5 })}</Text>
              <Text style={styles.unit}>{symbol}</Text>
              {refreshing && <ActivityIndicator color="#0A0A0C" style={{ marginLeft: 8 }} />}
            </View>

            {usd != null ? (
              <View style={styles.usdRow}>
                <Text style={styles.usd}>≈ {usd}</Text>
                {change != null && <Text style={styles.change}>{change} 24h</Text>}
              </View>
            ) : (
              // Balance known, value not (prices still in flight). Holding the row's space with a
              // placeholder keeps the card from reflowing when the figure lands — and, unlike the
              // old behaviour of hiding the row entirely, admits that a number is coming.
              <Skeleton width={130} height={18} round={radius.sm} style={{ backgroundColor: "#0A0A0C33" }} />
            )}
          </>
        )}

        <Text style={styles.address}>{shortAddress(address, 4, 4)}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 1 },
  overlay: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  amountRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2) },
  total: { color: "#0A0A0C", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  unit: { color: "#0A0A0C", fontSize: font.h2, fontWeight: "800", marginBottom: spacing(1.5) },
  usdRow: { flexDirection: "row", alignItems: "center", gap: spacing(3) },
  usd: { color: "#0A0A0C", fontSize: font.body, fontWeight: "800" },
  change: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
  address: { color: "#0A0A0CAA", fontSize: font.small, fontWeight: "700" },
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
