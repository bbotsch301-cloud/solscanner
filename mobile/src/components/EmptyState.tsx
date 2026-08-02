/**
 * A designed empty state — a tinted icon chip, a title, a supporting line, and an optional CTA —
 * replacing the plain grey "Nothing here yet" text scattered across lists. Modeled on the Home
 * "Fund your wallet" card so every empty surface feels intentional rather than unfinished.
 */
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { IconChip } from "./IconChip";
import { Button } from "./Button";
import { colors, font, leading, spacing, weight } from "../theme";

export function EmptyState({
  icon,
  title,
  subtitle,
  color = colors.textFaint,
  cta,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  color?: string;
  cta?: { label: string; icon?: keyof typeof Ionicons.glyphMap; onPress: () => void };
}) {
  return (
    <View style={styles.wrap}>
      <IconChip icon={icon} color={color} size={52} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      {cta && (
        <Button label={cta.label} icon={cta.icon} onPress={cta.onPress} size="md" style={styles.cta} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", paddingVertical: spacing(8), paddingHorizontal: spacing(6), gap: spacing(3) },
  title: { color: colors.text, fontSize: font.h3, fontWeight: weight.bold, textAlign: "center" },
  sub: { color: colors.textMuted, fontSize: font.small, textAlign: "center", lineHeight: font.small * leading.relaxed },
  cta: { marginTop: spacing(2), alignSelf: "center", paddingHorizontal: spacing(6) },
});
