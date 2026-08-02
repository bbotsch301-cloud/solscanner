/**
 * The Kingdom Key, pulled into place.
 *
 * The key starts inverted and appears to resist, then gets yanked upright — overshooting slightly
 * and settling, the way something magnetic snaps to its pole. The feeling lives entirely in the
 * shape of the curve: a timing function can only ease toward its target and stop, so it always
 * reads as "animated". A spring can pass its target and come back, and that overshoot is the
 * difference between a rotation and a thing being pulled.
 *
 * Everything is transform + opacity so it runs on the native driver. That matters more here than
 * anywhere else in the app: the splash is on screen precisely while the JS thread is busiest
 * (loading the vault, prefs, snapshots), and a JS-driven animation would stutter through it.
 */
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { haptics } from "../ui/haptics";
import { colors } from "../theme";

// Metro asset import; the ESM form would need a .png module declaration this project doesn't carry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const KEY = require("../../assets/kingdom-key.png") as number;

/** The artwork's true aspect (212×640) — the key is tall and narrow, so `size` is its HEIGHT. */
const ASPECT = 212 / 640;

/** How far it drifts backwards before the pull takes hold. */
const RESIST_TO = 190;
const RESIST_MS = 400;
/** The rotation at which it reads as "landed" — where the haptic fires. */
const LOCK_AT = 350;

export function KeySplash({ size = 320 }: { size?: number }) {
  // One driver for rotation; scale and glow are interpolated off it so they can't drift apart.
  const [turn] = useState(() => new Animated.Value(RESIST_TO));
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const locked = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return; // still asking
    if (reduceMotion) {
      // A spinning object on launch is exactly what this setting exists to suppress.
      turn.setValue(360);
      return;
    }

    // The haptic belongs to the landing, not the launch — fire it as the key crosses into place
    // rather than on a timer, so it stays true if the spring is retuned.
    const id = turn.addListener(({ value }) => {
      if (!locked.current && value >= LOCK_AT) {
        locked.current = true;
        haptics.bump();
      }
    });

    const anim = Animated.sequence([
      // Resist: a slow drift the wrong way, as though straining against the pull.
      Animated.timing(turn, {
        toValue: RESIST_TO + 8,
        duration: RESIST_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Snap: low friction so it overshoots ~8° and settles back with one small wobble.
      Animated.spring(turn, {
        toValue: 360,
        speed: 5,
        bounciness: 9,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => {
      anim.stop();
      turn.removeListener(id);
    };
  }, [reduceMotion, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 360], outputRange: ["0deg", "360deg"] });
  // Pulled toward the viewer as it rights itself, so the turn has depth rather than being flat.
  const scale = turn.interpolate({
    inputRange: [RESIST_TO, LOCK_AT, 360],
    outputRange: [0.92, 0.99, 1],
    extrapolate: "clamp",
  });
  // The glow flares as it lands, so the moment it locks is the brightest frame.
  const glow = turn.interpolate({
    inputRange: [RESIST_TO, LOCK_AT, 360],
    outputRange: [0.25, 0.85, 0.6],
    extrapolate: "clamp",
  });

  return (
    <View style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          { width: size * 0.62, height: size * 0.62, borderRadius: size, opacity: glow },
        ]}
      />
      <Animated.View style={{ transform: [{ rotate }, { scale }] }}>
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
  glow: { position: "absolute", backgroundColor: colors.primary + "26" },
});
