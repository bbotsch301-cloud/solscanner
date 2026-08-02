/**
 * Hides the app's content whenever it isn't the active app — the OS takes a snapshot of the
 * screen for the app switcher, and balances/addresses shouldn't be sitting in it.
 *
 * This is what lets the session survive a short trip to another app without weakening anything:
 * the lock gets a grace window (see BACKGROUND_GRACE_MS), and this cover makes sure nothing is
 * visible in the meantime. Purely visual — it does not lock or unlock the wallet.
 *
 * iOS fires `inactive` while the switcher animates (and for the notification shade), which is
 * exactly when the snapshot is taken, so both non-active states are covered.
 */
import { useEffect, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Crown } from "./Crown";
import { colors } from "../theme";

export function PrivacyCover() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setHidden(state !== "active"));
    return () => sub.remove();
  }, []);

  if (!hidden) return null;
  return (
    <View style={styles.cover} pointerEvents="none">
      <Crown size={140} />
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
});
