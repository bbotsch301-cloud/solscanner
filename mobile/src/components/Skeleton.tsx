/**
 * A shimmering placeholder block shown while data loads, instead of a blank area or "—". Pure
 * Animated opacity pulse (no gradient/deps). Compose a few of these to mock the shape of the
 * content that's coming (a balance number, a token row, etc.).
 */
import { useEffect, useState } from "react";
import { Animated, type DimensionValue, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "../theme";

export function Skeleton({
  width = "100%",
  height = 16,
  round = radius.sm,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [pulse] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: round, backgroundColor: colors.card, opacity: pulse }, style]}
    />
  );
}

/** A single token/holding row skeleton: avatar circle + two text bars. */
export function SkeletonRow() {
  return (
    <Animated.View style={styles.row}>
      <Skeleton width={40} height={40} round={20} />
      <Animated.View style={styles.rowMid}>
        <Skeleton width="55%" height={14} />
        <Skeleton width="35%" height={11} />
      </Animated.View>
      <Skeleton width={54} height={14} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowMid: { flex: 1, gap: 6 },
});
