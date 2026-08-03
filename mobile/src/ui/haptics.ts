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
  /**
   * A detent on a continuous control — the notch you feel dragging a slider.
   *
   * Same generator as `select`, named separately because the callers are different in kind: this
   * one fires repeatedly during a gesture, so it must only ever be called on a *crossing*, never on
   * every value change. A slider stepping 0–100 emits ~100 updates per drag; feeding all of them
   * here is a buzz, and the queue lags the finger so it feels worse than no haptic at all.
   */
  tick: () => run(() => Haptics.selectionAsync()),
  /** Success — a transaction landed. */
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Warning. */
  warn: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Error — a failed action / wrong PIN. */
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
