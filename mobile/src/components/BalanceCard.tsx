import { LinearGradient } from "expo-linear-gradient";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, font, radius, shortAddress, spacing } from "../theme";

export function BalanceCard({
  solBalance,
  address,
  network,
  refreshing,
}: {
  solBalance: number | null;
  address: string;
  network: string;
  refreshing?: boolean;
}) {
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
          {refreshing && <ActivityIndicator color="#1A1130" style={{ marginLeft: 8 }} />}
        </View>

        <Text style={styles.address}>{shortAddress(address, 4, 4)}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: 1 },
  overlay: { borderRadius: radius.lg - 1, padding: spacing(5), gap: spacing(3) },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { color: "#1A1130AA", fontSize: font.small, fontWeight: "700" },
  amountRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing(2) },
  total: { color: "#1A1130", fontSize: 44, fontWeight: "900", letterSpacing: -1 },
  unit: { color: "#1A1130", fontSize: font.h2, fontWeight: "800", marginBottom: spacing(1.5) },
  address: { color: "#1A1130AA", fontSize: font.small, fontWeight: "700" },
  netPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: "#1A113022",
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#1A1130" },
  netText: { color: "#1A1130", fontSize: font.tiny, fontWeight: "800" },
});
