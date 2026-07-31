import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, radius, shortAddress, spacing, usd } from "../theme";

export function BalanceCard({
  total,
  change24h,
  address,
  network,
}: {
  total: number;
  change24h: number;
  address: string;
  network: string;
}) {
  const positive = change24h >= 0;
  const changePct = (Math.abs(change24h) * 100).toFixed(2);

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
          <View style={styles.netPill}>
            <View style={styles.dot} />
            <Text style={styles.netText}>{network}</Text>
          </View>
        </View>

        <Text style={styles.total}>{usd(total)}</Text>

        <View style={styles.row}>
          <View style={styles.changeRow}>
            <Ionicons
              name={positive ? "arrow-up" : "arrow-down"}
              size={14}
              color="#0B0B0F"
            />
            <Text style={styles.change}>{changePct}% today</Text>
          </View>
          <Text style={styles.address}>{shortAddress(address, 4, 4)}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: 1,
  },
  overlay: {
    borderRadius: radius.lg - 1,
    padding: spacing(5),
    gap: spacing(3),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  label: {
    color: "#0B0B0FAA",
    fontSize: font.small,
    fontWeight: "700",
  },
  total: {
    color: "#0B0B0F",
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1),
  },
  change: {
    color: "#0B0B0F",
    fontSize: font.small,
    fontWeight: "800",
  },
  address: {
    color: "#0B0B0FAA",
    fontSize: font.small,
    fontWeight: "700",
  },
  netPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(1.5),
    backgroundColor: "#0B0B0F22",
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0B0B0F",
  },
  netText: {
    color: "#0B0B0F",
    fontSize: font.tiny,
    fontWeight: "800",
  },
});
