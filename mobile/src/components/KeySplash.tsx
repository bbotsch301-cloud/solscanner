/**
 * The Kingdom Key turning upright.
 *
 * This is deliberately the same shape as the crown animation that worked: one Animated.Value driven
 * 0→1 by a single timing, interpolated straight to degrees. Earlier versions layered on a sequence,
 * a spring, a value listener for haptics, a scale track and an async reduce-motion gate — and
 * somewhere in all that the turn stopped happening at all.
 *
 * Start from what works. Anything added back goes in one piece at a time, checked on a device.
 */
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

// Metro asset import; the ESM form would need a .png module declaration this project doesn't carry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KEY = require("../../assets/kingdom-key.png") as number;

/** The artwork is 212×640, so `size` is the key's HEIGHT and the width follows. */
const ASPECT = 212 / 640;
const TURN_MS = 1100;

export function KeySplash({
  size = 320,
  animate = true,
}: {
  size?: number;
  /** False renders the key already upright and still, for a second mount that must not replay it. */
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
        <Image
          source={KEY}
          alt="Kingdom Key"
          style={{ width: size * ASPECT, height: size }}
          contentFit="contain"
          // No fade: the key must be present for the very first frame of the turn.
          transition={0}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
});
