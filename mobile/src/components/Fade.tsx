import { useEffect, useState, type ReactNode } from "react";
import { Animated } from "react-native";

/** Fades its children in on mount — used to soften the full-screen "gate" swaps
 *  (onboarding, lock, PIN, backup) that live outside the navigator and would
 *  otherwise hard-cut. Sits on the app's black background, so a fade reads clean. */
export function Fade({ children, duration = 220 }: { children: ReactNode; duration?: number }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [opacity, duration]);
  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>;
}
