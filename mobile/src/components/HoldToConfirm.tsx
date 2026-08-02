/**
 * Press-and-hold to commit an irreversible action.
 *
 * A tap is too cheap for the last step of spending real money — it's one mis-aimed thumb away from
 * a swap you didn't mean. Holding makes the commitment deliberate without adding a second screen:
 * gold sweeps across the button, haptics tick as it fills, and releasing early cancels with
 * nothing sent.
 *
 * The fill is a `transform: scaleX` on an `Animated.View`, which runs on the native driver — it
 * stays smooth even though the JS thread is busy building a transaction the moment it completes.
 * (An SVG ring would have been prettier but `strokeDashoffset` can't use the native driver, so it
 * would stutter at exactly the wrong time.)
 */
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { haptics } from "../ui/haptics";
import { colors, font, onPrimary, radius, spacing, tracking, weight } from "../theme";

const HOLD_MS = 1100;

export function HoldToConfirm({
  label = "Hold to swap",
  confirmedLabel = "Confirming…",
  onConfirm,
  disabled = false,
}: {
  label?: string;
  confirmedLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [progress] = useState(() => new Animated.Value(0));
  // Needed for the left-anchored fill: RN has no transformOrigin, so scaleX grows from the centre
  // and has to be pushed back by half the (scaled) width to look like it's filling from the left.
  const [width, setWidth] = useState(0);
  const [held, setHeld] = useState(false);
  const [done, setDone] = useState(false);
  const ticked = useRef(new Set<number>());
  const fired = useRef(false);

  // Haptic ticks as the fill passes quarter marks, so the hold has texture rather than being a
  // silent wait. Listener (not setInterval) so the feedback tracks the actual animation.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      for (const mark of [0.25, 0.5, 0.75]) {
        if (value >= mark && !ticked.current.has(mark)) {
          ticked.current.add(mark);
          haptics.tap();
        }
      }
    });
    return () => progress.removeListener(id);
  }, [progress]);

  const start = () => {
    if (disabled || done) return;
    setHeld(true);
    haptics.bump();
    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || fired.current) return;
      fired.current = true;
      setDone(true);
      haptics.success();
      onConfirm();
    });
  };

  const cancel = () => {
    if (fired.current) return;
    setHeld(false);
    ticked.current.clear();
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={cancel}
      disabled={disabled || done}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold for one second to confirm. Release early to cancel."
      accessibilityState={{ disabled: disabled || done }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.wrap, disabled && styles.disabled]}
    >
      {/* Fill grows from the left edge. */}
      <View style={styles.fillClip} pointerEvents="none">
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width / 2, 0] }) },
                { scaleX: progress },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={[colors.gradA, colors.gradB]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>

      <View style={styles.labelRow} pointerEvents="none">
        <Ionicons
          name={done ? "checkmark-circle" : held ? "lock-open-outline" : "finger-print"}
          size={18}
          color={held || done ? onPrimary : colors.primary}
        />
        <Text style={[styles.label, (held || done) && { color: onPrimary }]}>
          {done ? confirmedLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 56,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary + "1A",
    overflow: "hidden",
    justifyContent: "center",
  },
  disabled: { opacity: 0.45 },
  fillClip: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing(2) },
  label: {
    color: colors.primary,
    fontSize: font.body,
    fontWeight: weight.bold,
    letterSpacing: tracking.wide,
  },
});
