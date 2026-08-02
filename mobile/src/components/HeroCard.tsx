/**
 * The gold gradient "hero" surface used for the treasury value, wallet balance, and voting power.
 * It's the app's signature element: a metallic gradient framed by a 1px border (the gradient shows
 * through the inset), now with a subtle lift. Extracted so the three hand-rolled copies share one
 * definition. Text inside should use the `semantic.heroText*` tokens (dark, for legibility on gold).
 */
import { LinearGradient } from "expo-linear-gradient";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, elevation, radius, spacing } from "../theme";

export function HeroCard({
  children,
  padding = spacing(5),
  gap = spacing(2),
  style,
}: {
  children?: React.ReactNode;
  padding?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={[colors.gradA, colors.gradB]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, elevation(2), style]}
    >
      <View style={[styles.inner, { padding, gap }]}>{children}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, padding: 1 },
  inner: { borderRadius: radius.lg - 1 },
});
