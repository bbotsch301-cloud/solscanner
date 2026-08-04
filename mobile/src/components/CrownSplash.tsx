/**
 * The crown turning up from inverted and settling upright.
 *
 * This is the app's original splash, restored. It was replaced by the Kingdom Key in `ea7b7de` and
 * is now back by request — so the animation is the one that shipped before, verbatim: a single
 * `Animated.Value` driven 0→1 by one timing, interpolated 180°→360°, `Easing.out(Easing.cubic)`
 * over 1100ms. A half turn, one deliberate beat, no endless spin. A crown shouldn't sit inverted.
 *
 * **What is NOT restored is its shape.** The original lived inline in `App.tsx` with no way to
 * suppress the animation, and two fixes landed against the key afterwards that the crown never had:
 * the boot splash mounting twice and restarting the turn partway (`f9918d9`), and the turn being cut
 * off before it finished (`4496da1`). Reverting to the literal old code would have quietly
 * reintroduced both. So this keeps the key's component shape — the `animate` prop and one instance
 * owning the whole animation — and only the artwork and its motion go back.
 *
 * A full 360° spin is deliberately NOT used here: that is the app's idiom for *working*, spoken by
 * the turning crown in `SwapConfirmSheet`. A splash is an arrival, not a wait.
 */
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Crown } from "./Crown";

const TURN_MS = 1100;

export function CrownSplash({
  size = 192,
  animate = true,
}: {
  size?: number;
  /** False renders the crown already upright and still, for a second mount that must not replay it. */
  animate?: boolean;
}) {
  const [spin] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate) return;
    const anim = Animated.timing(spin, {
      toValue: 1,
      duration: TURN_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [animate, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Crown size={size} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
