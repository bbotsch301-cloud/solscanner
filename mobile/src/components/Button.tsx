/**
 * The app's primary call-to-action. One component for the gold pill (primary), the bordered
 * pill (secondary), and the destructive pill (danger), built on PressableScale so every press
 * springs + buzzes. Supports a leading icon, a loading spinner, and — crucially — a *legible*
 * disabled state: a dimmed gold pill with a border, not the near-invisible card-colored pill the
 * hand-rolled buttons used.
 */
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { colors, font, radius, spacing, weight } from "../theme";

type Variant = "primary" | "secondary" | "danger";
type Size = "md" | "lg";

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  icon,
  loading = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const fg =
    variant === "primary" ? colors.bg : variant === "danger" ? colors.negative : colors.text;
  const spinner = variant === "primary" ? colors.bg : fg;

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      // The press already gives feedback; keep the tap haptic on enabled buttons only.
      haptic={isDisabled ? null : "tap"}
      style={[
        styles.base,
        size === "lg" ? styles.lg : styles.md,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "danger" && styles.danger,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={spinner} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={size === "lg" ? 18 : 16} color={fg} />}
          <Text style={[styles.label, size === "md" && styles.labelMd, { color: fg }]}>{label}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  lg: { paddingVertical: spacing(4), minHeight: 52 },
  md: { paddingVertical: spacing(3), minHeight: 44, paddingHorizontal: spacing(5) },
  row: { flexDirection: "row", alignItems: "center", gap: spacing(2) },
  label: { fontSize: font.h3, fontWeight: weight.bold },
  labelMd: { fontSize: font.body },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.card, borderColor: colors.cardBorder },
  danger: { backgroundColor: colors.negative + "1A", borderColor: colors.negative + "66" },
  // Legible disabled: keep the pill visible (dimmed) with a gold hairline, never a dead card fill.
  disabled: { opacity: 0.45 },
});
