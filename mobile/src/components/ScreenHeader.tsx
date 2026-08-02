/**
 * One header for every screen — replacing the ~6 bespoke `topBar` styles. Renders an optional
 * eyebrow, a title, and a subtitle stacked on the left, an optional back chevron before them, and
 * a right slot that's either a close button (`onClose`) or any custom node (`right`). Applies the
 * safe-area top inset itself so screens don't each re-derive it.
 *
 * `size="large"` — big display title (tab roots, pushed list screens like Activity/More).
 * `size="modal"` — the slightly smaller title used on bottom-sheet modals (Send, Receive, Swap).
 */
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, font, leading, spacing, tracking, weight } from "../theme";
import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  onBack,
  onClose,
  right,
  size = "large",
  paddingHorizontal = spacing(4),
  style,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  onBack?: () => void;
  onClose?: () => void;
  right?: ReactNode;
  size?: "large" | "modal";
  paddingHorizontal?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing(2), paddingHorizontal }, style]}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.textMuted} />
        </Pressable>
      )}
      <View style={styles.titles}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={size === "large" ? styles.titleLarge : styles.titleModal} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ?? (onClose && (
        <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingBottom: spacing(2) },
  back: { marginLeft: -spacing(1) },
  titles: { flex: 1, gap: 2 },
  eyebrow: {
    color: colors.accent,
    fontSize: font.tiny,
    fontWeight: weight.bold,
    textTransform: "uppercase",
    letterSpacing: tracking.wide,
  },
  titleLarge: { color: colors.text, fontSize: font.h1, fontWeight: weight.black, letterSpacing: tracking.tight },
  titleModal: { color: colors.text, fontSize: font.h2, fontWeight: weight.bold },
  subtitle: { color: colors.textMuted, fontSize: font.small, lineHeight: font.small * leading.normal },
  close: { marginRight: -spacing(1) },
});
