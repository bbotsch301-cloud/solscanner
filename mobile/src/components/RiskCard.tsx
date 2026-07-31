import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { RiskLevel, RiskReport } from "../safety/risk";
import { colors, font, radius, spacing } from "../theme";

const STYLE: Record<RiskLevel, { color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  safe: { color: colors.positive, icon: "shield-checkmark" },
  info: { color: "#38bdf8", icon: "information-circle" },
  caution: { color: colors.warning, icon: "warning" },
  danger: { color: colors.negative, icon: "alert-circle" },
};

export function RiskCard({
  report,
  checking,
}: {
  report: RiskReport | null;
  checking: boolean;
}) {
  if (checking) {
    return (
      <View style={[styles.card, { borderColor: colors.cardBorder }]}>
        <ActivityIndicator color={colors.textMuted} />
        <Text style={styles.checkingText}>Checking recipient…</Text>
      </View>
    );
  }
  if (!report) return null;

  const s = STYLE[report.level];
  return (
    <View style={[styles.card, { borderColor: s.color + "66", backgroundColor: s.color + "14" }]}>
      <Ionicons name={s.icon} size={20} color={s.color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.headline, { color: s.color }]}>{report.headline}</Text>
        {report.reasons.map((r, i) => (
          <Text key={i} style={styles.reason}>{r}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing(2),
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(3.5),
  },
  checkingText: { color: colors.textMuted, fontSize: font.small, alignSelf: "center" },
  headline: { fontSize: font.body, fontWeight: "800", marginBottom: 2 },
  reason: { color: colors.textMuted, fontSize: font.small, lineHeight: 18 },
});
