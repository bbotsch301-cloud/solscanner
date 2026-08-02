/**
 * The quiet "this is last-known, we're fetching" marker.
 *
 * The rule it exists to serve, applied everywhere in the app:
 *
 *   cached value + refresh in flight  →  show the value, with this cue
 *   no cached value at all            →  show a Skeleton
 *   never                             →  render an unloaded number as $0.00
 *
 * Deliberately smaller and calmer than a Skeleton: a Skeleton says "there's nothing here yet",
 * this says "what you're reading is real, just a moment old". They must not look alike.
 */
import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, font, spacing } from "../theme";

/** A slowly breathing dot. Same idea as Skeleton's pulse, but slower and much less contrasty so
 *  it reads as ambient rather than as something demanding attention. */
function PulseDot({ size, color }: { size: number; color: string }) {
  const [pulse] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: pulse }}
    />
  );
}

export function Updating({
  label = "Updating",
  /** Dot only — for tight spots like beside a hero number, where the word would crowd it. */
  compact = false,
  color = colors.primary,
  style,
}: {
  label?: string;
  compact?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]}>
      <PulseDot size={compact ? 5 : 6} color={color} />
      {!compact && <Text style={[styles.label, { color }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", gap: spacing(1.5) },
  label: { fontSize: font.tiny, fontWeight: "700", letterSpacing: 0.3, opacity: 0.85 },
});
