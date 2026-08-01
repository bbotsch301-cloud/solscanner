import Svg, { Circle, G } from "react-native-svg";
import { StyleSheet, Text, View } from "react-native";
import { colors, font, spacing } from "../theme";

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

/** Distinct slice colors (gold-forward), cycled if there are more slices. */
export const PIE_COLORS = [
  "#E7B838", // XGO gold
  "#3FCF8E", // green
  "#627EEA", // eth blue
  "#F0B90B", // bnb yellow
  "#F0616D", // red
  "#A78BFA", // purple
  "#22D3EE", // cyan
  "#F3D27A", // light gold
  "#FB923C", // orange
  "#94A3B8", // slate
];

/**
 * A lightweight SVG donut — one <Circle> per slice using the strokeDasharray trick
 * (no path math), with an optional center label/value and a legend showing each
 * slice's share.
 */
export function PieChart({
  data,
  size = 172,
  stroke = 26,
  centerValue,
  centerLabel,
}: {
  data: PieSlice[];
  size?: number;
  stroke?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <G rotation={-90} originX={size / 2} originY={size / 2}>
            {total > 0 ? (
              data.map((d, i) => {
                const frac = Math.max(0, d.value) / total;
                const dash = frac * circumference;
                const el = (
                  <Circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={-offset}
                  />
                );
                offset += dash;
                return el;
              })
            ) : (
              <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.cardBorder} strokeWidth={stroke} />
            )}
          </G>
        </Svg>
        {(centerValue || centerLabel) && (
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            {centerValue && <Text style={styles.centerValue}>{centerValue}</Text>}
            {centerLabel && <Text style={styles.centerLabel}>{centerLabel}</Text>}
          </View>
        )}
      </View>

      <View style={styles.legend}>
        {data.map((d, i) => {
          const pct = total > 0 ? (Math.max(0, d.value) / total) * 100 : 0;
          return (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: d.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>
                {d.label}
              </Text>
              <Text style={styles.legendPct}>{pct.toFixed(1)}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing(4) },
  center: { alignItems: "center", justifyContent: "center" },
  centerValue: { color: colors.text, fontSize: font.h3, fontWeight: "900" },
  centerLabel: { color: colors.textMuted, fontSize: font.tiny, fontWeight: "700", marginTop: 2 },
  legend: { flex: 1, gap: spacing(2) },
  legendRow: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1, color: colors.text, fontSize: font.small, fontWeight: "600" },
  legendPct: { color: colors.textMuted, fontSize: font.small, fontWeight: "800" },
});
