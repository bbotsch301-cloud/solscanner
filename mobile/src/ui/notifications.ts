/**
 * Local (and, later, remote) notifications. Phase 1 is entirely local — no backend, no push
 * token, no EAS projectId required — firing a device notification when the wallet detects an
 * incoming balance change while the app is running. Everything is crash-safe/no-op so it never
 * breaks UI code, and it silently does nothing in Expo Go (notifications need a dev build).
 */
import * as Notifications from "expo-notifications";

let configured = false;

/** Show notifications even while the app is foregrounded (iOS suppresses them otherwise). */
export function configureNotifications(): void {
  if (configured) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    /* module unavailable (e.g. Expo Go) — ignore */
  }
}

/** Register a callback for when the user taps a notification. Returns a cleanup fn. */
export function onNotificationTap(handler: () => void): () => void {
  try {
    const sub = Notifications.addNotificationResponseReceivedListener(() => handler());
    return () => sub.remove();
  } catch {
    return () => {};
  }
}

/** Ask for notification permission. Returns whether it's granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === "granted";
  } catch {
    return false;
  }
}

/**
 * What happened to the last notification we tried to send.
 *
 * Every failure in this file used to be swallowed — including the send itself, which is the single
 * most valuable error here. That's why a deterministic bug took three attempts to find: from the
 * outside, "blocked by the OS", "not built with notification support" and "the detector never
 * fired" all look exactly the same, which is to say like nothing at all. Same idea as
 * solana/feeDiagnostics.ts, which exists for the same reason on the fee path.
 */
export interface NotifyAttempt {
  at: number;
  body: string;
  ok: boolean;
  /** Why it failed, when it did. */
  detail?: string;
}
let lastAttempt: NotifyAttempt | null = null;

/** The last notification attempt, for the Settings screen to display. */
export function lastNotifyAttempt(): NotifyAttempt | null {
  return lastAttempt;
}

/** Current OS-level permission, which the in-app toggle does NOT track. */
export async function notificationPermissionStatus(): Promise<"granted" | "denied" | "undetermined"> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") return "granted";
    return status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Fire an immediate local "Received X" notification. Fire-and-forget. */
export function notifyReceived(input: { symbol: string; amount: number; usd?: number | null }): void {
  const amt =
    input.amount > 0 && input.amount < 0.0001
      ? input.amount.toPrecision(2)
      : input.amount.toLocaleString("en-US", { maximumFractionDigits: 6 });
  const usd =
    input.usd != null && input.usd > 0
      ? ` (~$${input.usd.toLocaleString("en-US", { maximumFractionDigits: 2 })})`
      : "";
  const body = `${amt} ${input.symbol}${usd}`;
  const note = (ok: boolean, detail?: string) => {
    lastAttempt = { at: Date.now(), body, ok, detail };
  };
  try {
    Notifications.scheduleNotificationAsync({
      content: { title: "Received", body, sound: true },
      trigger: null, // immediate
    }).then(
      () => note(true),
      // Still swallowed — a failed alert must never break a balance refresh — but no longer
      // invisible. Settings shows this, so "nothing happened" becomes a readable reason.
      (e) => note(false, e instanceof Error ? e.message : String(e))
    );
  } catch (e) {
    note(false, e instanceof Error ? e.message : String(e));
  }
}

/**
 * Phase-2 hook: register this device's push token + the user's addresses with a backend so it can
 * push even when the app is closed. No-op unless EXPO_PUBLIC_NOTIFY_API is set AND a push token is
 * obtainable (requires an EAS projectId + dev build). Safe to call anytime.
 */
const NOTIFY_API = process.env.EXPO_PUBLIC_NOTIFY_API;
export async function registerForBackendPush(addresses: string[]): Promise<void> {
  if (!NOTIFY_API || addresses.length === 0) return;
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await fetch(NOTIFY_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, addresses }),
    });
  } catch {
    /* no projectId/backend yet — no-op */
  }
}
