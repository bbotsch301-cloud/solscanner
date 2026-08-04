/**
 * The loading spinner, in the app's own language rather than the OS's.
 *
 * Two gold arcs turning against each other — the outer one sweeping clockwise, the inner one
 * slower and counter-clockwise, so the pair never quite repeats and reads as motion rather than a
 * loop. Gold on black, matching the hero card and the tab bar; the stock grey iOS spinner was the
 * one piece of chrome that still looked borrowed.
 *
 * Driven by two `Animated.Value`s on `transform` only, so it runs on the native driver — the JS
 * thread is usually busy building a transaction or parsing balances at exactly the moment this is
 * on screen, and a spinner that stutters while you wait is worse than no spinner. Same constraint
 * the hold-to-confirm fill is built around.
 */
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";
import { colors } from "../theme";

const AnimatedView = Animated.View;

/** One arc of a circle, drawn as a dashed stroke with a single visible segment. */
function Arc({
  size,
  stroke,
  width,
  sweep,
  gradientId,
}: {
  size: number;
  stroke: string;
  width: number;
  /** Fraction of the circumference that's drawn, 0–1. */
  sweep: number;
  gradientId: string;
}) {
  const r = (size - width) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor={stroke} stopOpacity="1" />
          {/* Fading the tail is what turns a rotating dash into a comet. */}
          <Stop offset="100%" stopColor={stroke} stopOpacity="0.15" />
        </LinearGradient>
      </Defs>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={`url(#${gradientId})`}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={`${circumference * sweep} ${circumference}`}
        fill="none"
      />
    </Svg>
  );
}

export function BrandSpinner({ size = 28 }: { size?: number }) {
  // useState, not useRef — matches Skeleton/Updating/CrownSplash, and the compiler treats reading
  // a ref during render as a mistake.
  const [outer] = useState(() => new Animated.Value(0));
  const [inner] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const spin = (v: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.linear, // a spinner that eases looks like it's struggling
          useNativeDriver: true,
        })
      );
    // Deliberately not a common multiple: the two arcs drift against each other instead of
    // locking into a visible repeat.
    const a = spin(outer, 900);
    const b = spin(inner, 1400);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [outer, inner]);

  const cw = outer.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  const ccw = inner.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "-360deg"] });
  const innerSize = size * 0.6;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <AnimatedView style={{ transform: [{ rotate: cw }] }}>
        <Arc size={size} stroke={colors.primary} width={Math.max(2, size * 0.09)} sweep={0.7} gradientId="spinOuter" />
      </AnimatedView>
      <AnimatedView style={[styles.inner, { transform: [{ rotate: ccw }] }]}>
        <Arc size={innerSize} stroke={colors.accent} width={Math.max(1.5, size * 0.06)} sweep={0.45} gradientId="spinInner" />
      </AnimatedView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  inner: { position: "absolute" },
});
