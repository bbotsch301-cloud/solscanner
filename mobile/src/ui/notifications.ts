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
  try {
    Notifications.scheduleNotificationAsync({
      content: { title: "Received", body: `${amt} ${input.symbol}${usd}`, sound: true },
      trigger: null, // immediate
    }).catch(() => {});
  } catch {
    /* ignore */
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
