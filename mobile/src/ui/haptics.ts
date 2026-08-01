/**
 * Tiny crash-safe wrapper over expo-haptics. Every call is fire-and-forget and swallowed in a
 * try/catch, so it's a silent no-op on devices/emulators without a Taptic engine (and never
 * blocks or throws into UI code). Import `haptics` and call `haptics.tap()` etc. at the moment
 * of the interaction.
 */
import * as Haptics from "expo-haptics";

function run(fn: () => Promise<unknown>): void {
  try {
    fn().catch(() => {});
  } catch {
    /* haptics unavailable — ignore */
  }
}

export const haptics = {
  /** Light tap — button/row presses, copy actions. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Medium tap — a more deliberate action. */
  bump: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Selection change — switching wallet/chain/tab. */
  select: () => run(() => Haptics.selectionAsync()),
  /** Success — a transaction landed. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Warning. */
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Error — a failed action / wrong PIN. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
