/**
 * The standard bordered surface — the warm-black card with a hairline border used throughout the
 * app. A thin wrapper so new surfaces share one radius/border/padding treatment; pass `elevated`
 * for a subtle lift (heroes/modals) or override `padding`/`radius` when needed. Existing hand-rolled
 * cards are left as-is; reach for this on new surfaces.
 */
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevation, radius as radii, spacing } from "../theme";

export function Card({
  children,
  padding = spacing(4),
  radius = radii.md,
  elevated = false,
  style,
}: {
  children?: React.ReactNode;
  padding?: number;
  radius?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, { padding, borderRadius: radius }, elevated && elevation(1), style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
});
