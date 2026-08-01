/** A success checkmark that springs in (scale + fade with a little overshoot) on mount — for
 *  "Sent"/"Swapped" screens so the confirmation pops instead of hard-cutting in. The haptic is
 *  fired by the caller at the moment the transaction lands, not here. */
import { useEffect, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function SuccessCheck({ size = 88 }: { size?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }).start();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const ring = size * 1.36;
  return (
    <Animated.View
      style={[
        styles.ring,
        { width: ring, height: ring, borderRadius: ring / 2, opacity: v, transform: [{ scale }] },
      ]}
    >
      <Animated.View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
        <Ionicons name="checkmark" size={Math.round(size * 0.6)} color={colors.bg} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary + "22" },
  circle: { alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
});
