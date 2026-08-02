/**
 * The Kingdom Key turning upright.
 *
 * Same shape as the crown animation that worked: one Animated.Value driven 0→1 by a single timing,
 * interpolated straight to degrees. An earlier attempt at the magnetic feel used a sequence and a
 * spring and stopped turning altogether — so the pull lives in the EASING instead, which changes
 * how it moves without changing what drives it.
 */
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { Image } from "expo-image";

// Metro asset import; the ESM form would need a .png module declaration this project doesn't carry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KEY = require("../../assets/kingdom-key.png") as number;

/** The artwork is 212×640, so `size` is the key's HEIGHT and the width follows. */
const ASPECT = 212 / 640;
const TURN_MS = 1150;
/**
 * How hard it resists, and how far it overshoots. `back` easing leaves the 0→1 range at both ends:
 * below zero at the start (the key rotates slightly the WRONG way, as if straining against the
 * pull) and above one at the end (it swings past upright and eases home). Raise for more drama,
 * lower toward 0 for a plain turn.
 */
const MAGNETISM = 1.4;

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
      // The whole magnetic character is this curve — anticipation, then a hard pull, then an
      // overshoot that settles. Structurally identical to the plain turn that works: still one
      // value, one timing, one interpolation. Only the easing changed.
      easing: Easing.inOut(Easing.back(MAGNETISM)),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [animate, spin]);

  // Default extrapolation matters here: `back` sends the driver outside 0→1, and that's precisely
  // what carries the key past 360° and back. Clamping would flatten the effect into a plain turn.
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
