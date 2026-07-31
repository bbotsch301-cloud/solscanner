import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, shortAddress, spacing } from "../theme";

export function BalanceCard({
  solBalance,
  address,
  network,
  refreshing,
  usdValue,
  change24h,
}: {
  solBalance: number | null;
  address: string;
  network: string;
  refreshing?: boolean;
  usdValue?: number | null;
  change24h?: number | null;
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
          <View style={styles.netPill}>
            <View style={styles.dot} />
            <Text style={styles.netText}>{network}</Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.total}>
            {solBalance == null ? "—" : solBalance.toLocaleString("en-US", { maximumFractionDigits: 5 })}
          </Text>
          <Text style={styles.unit}>SOL</Text>
          {refreshing && <ActivityIndicator color="#0A0A0C" style={{ marginLeft: 8 }} />}
        </View>

        {usd != null && (
          <View style={styles.usdRow}>
            <Text style={styles.usd}>≈ {usd}</Text>
            {change != null && <Text style={styles.change}>{change} 24h</Text>}
          </View>
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
});
