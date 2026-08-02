/**
 * A tinted circular icon container — the small rounded badge that leads list rows, empty states,
 * and section headers. The background is a translucent wash of `color` (default gold) so it reads
 * on the warm-black surface without a hard fill.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radius } from "../theme";

export function IconChip({
  icon,
  color = colors.primary,
  size = 40,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.chip,
        { width: size, height: size, borderRadius: radius.pill, backgroundColor: color + "22", borderColor: color + "44" },
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
