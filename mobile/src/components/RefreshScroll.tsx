/**
 * A ScrollView with pull-to-refresh that shows OUR spinner — and only ours.
 *
 * This deliberately does NOT use RefreshControl. The first attempt did, with `tintColor:
 * "transparent"` to hide the platform indicator, and iOS drew it anyway: you got the grey system
 * spinner and the gold one on top of each other. There's no reliable way to keep RefreshControl's
 * gesture while suppressing its indicator, so the pull is detected here instead.
 *
 * The mechanics are deliberately plain: watch the scroll offset, and once the user has dragged
 * past the threshold, fire. While refreshing, a spacer at the top of the content holds the
 * spinner and pushes the list down — no absolute positioning, no background layering, nothing
 * that can silently cover the thing it's meant to reveal (which is exactly how the last version
 * went wrong).
 */
import { useRef, type ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BrandSpinner } from "./BrandSpinner";
import { haptics } from "../ui/haptics";
import { colors, spacing } from "../theme";

/** How far past the top the drag has to go before it counts as a pull. */
const PULL_THRESHOLD = 70;
/** Height the spinner sits in while refreshing. */
const SPINNER_SLOT = 56;

export function RefreshScroll({
  refreshing,
  onRefresh,
  contentContainerStyle,
  /** SwapScreen needs "handled" so a tap on the token picker doesn't just dismiss the keyboard. */
  keyboardShouldPersistTaps,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  children: ReactNode;
}) {
  // One trigger per pull: the offset stays past the threshold for many scroll events, and
  // re-arming only after the list returns near the top stops a single drag firing repeatedly.
  const armed = useRef(true);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y <= -PULL_THRESHOLD && armed.current && !refreshing) {
      armed.current = false;
      haptics.tap(); // replaces the release tick RefreshControl used to give
      onRefresh();
    } else if (y > -8) {
      armed.current = true;
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
      >
        {refreshing && (
          <View style={styles.slot}>
            <BrandSpinner size={30} />
          </View>
        )}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  slot: { height: SPINNER_SLOT, alignItems: "center", justifyContent: "center", marginBottom: spacing(1) },
});
