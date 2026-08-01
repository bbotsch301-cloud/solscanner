/**
 * Drop-in Pressable that springs down to 0.96 on press (and back on release) and fires a light
 * haptic — so every tap feels responsive. The scale rides on `transform`, so layout is unchanged
 * vs a plain Pressable. Use in place of `<Pressable>` for buttons/rows; pass `haptic={null}` to
 * mute the tap buzz (e.g. when the press already triggers a stronger success/error haptic).
 */
import { useState, type ReactNode } from "react";
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { haptics } from "../ui/haptics";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type HapticKind = "tap" | "select" | null;

export function PressableScale({
  children,
  style,
  onPress,
  disabled,
  haptic = "tap",
  scaleTo = 0.96,
  hitSlop,
  ...rest
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  disabled?: boolean;
  haptic?: HapticKind;
  scaleTo?: number;
} & Pick<PressableProps, "hitSlop">) {
  const [scale] = useState(() => new Animated.Value(1));

  const pressIn = () => {
    if (haptic) haptics[haptic]();
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 45, bounciness: 0 }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  };

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
}
