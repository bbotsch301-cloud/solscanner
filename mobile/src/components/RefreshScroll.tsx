/**
 * A ScrollView with pull-to-refresh that shows OUR spinner instead of the platform's.
 *
 * The trick is layering: the indicator sits in a wrapper behind the list, and the list itself must
 * be transparent so the strip the pull opens up reveals it. Getting that background wrong is
 * silent — an opaque list hides the spinner permanently and looks exactly like a spinner that
 * never renders — so it lives here once rather than being re-derived per screen.
 *
 * RefreshControl still owns the gesture, the threshold and the release haptic. Only its own
 * indicator is suppressed (transparent tint on iOS, transparent colours on Android).
 */
import { type ReactNode } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { BrandSpinner } from "./BrandSpinner";
import { colors, spacing } from "../theme";

export function RefreshScroll({
  refreshing,
  onRefresh,
  /** Distance from the top of THIS component to the spinner. Screens with their own header can
   *  leave it default; a full-bleed screen should pass its safe-area inset. */
  spinnerTop = spacing(4),
  contentContainerStyle,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  spinnerTop?: number;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {refreshing && (
        <View style={[styles.slot, { top: spinnerTop }]} pointerEvents="none">
          <BrandSpinner size={30} />
        </View>
      )}
      <ScrollView
        // Transparent ON PURPOSE — the wrapper carries the background. An opaque colour here
        // covers the spinner for good.
        style={styles.scroll}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="transparent"
            colors={["transparent"]}
            progressBackgroundColor="transparent"
          />
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1, backgroundColor: "transparent" },
  slot: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
