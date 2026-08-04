/**
 * Fresh biometric / device-passcode confirmation before an action that deserves one.
 *
 * Only gates when the wallet has a lock set; if the device has no biometric/passcode enrolled we
 * can't prompt, so we don't block (app-entry lock already gated access). Shared by WalletConnect and
 * the in-app browser so both use the identical gate.
 *
 * ## Two kinds of caller, and the difference is deliberate
 *
 * **Signing something that moves funds** must prompt every single time. A dApp request and a
 * WalletConnect transaction are exactly what this was built for, and a member's assent to one is not
 * assent to the next.
 *
 * **Opening content you already own** is a different question, and it was being asked far too often.
 * Proving ownership of a book costs a prompt; leaving the app for thirty seconds and coming back
 * costs another; and neither told the member anything they hadn't just said. Worse, the app was
 * stricter about a book than about the seed phrase — with no PIN and no biometrics set the wallet
 * never locks at all, while the vault still demanded a confirmation per open. That is backwards.
 *
 * So `grace` is opt-in per call, and the fund-moving callers do not pass it. A caller that wants the
 * grace has to say so, which means the strict behaviour is what you get by forgetting.
 *
 * The window is in memory only. A process death re-prompts, because "recently confirmed" is a fact
 * about this session, and persisting it would be inventing consent across a restart.
 */
import * as LocalAuthentication from "expo-local-authentication";
import { pinEnabled } from "../wallet/lock";
import { isBiometricEnabled } from "./prefs";

/**
 * How long a confirmation stays good for callers that opt in.
 *
 * Matches `INACTIVITY_MS` in `wallet/WalletContext.tsx` — the wallet already treats five minutes of
 * no interaction as the point where a member has stopped paying attention, and a second number
 * meaning the same thing would drift from the first.
 */
const GRACE_MS = 5 * 60 * 1000;

let lastSuccessAt = 0;

/**
 * Confirm, or let a recent confirmation stand.
 *
 * `grace: true` accepts a success from the last few minutes instead of prompting again. Pass it for
 * reading; never for signing.
 */
export async function requireReauth(
  promptMessage = "Confirm this request",
  opts: { grace?: boolean } = {},
): Promise<boolean> {
  if (!pinEnabled() && !isBiometricEnabled()) return true;

  if (opts.grace && lastSuccessAt > 0 && Date.now() - lastSuccessAt < GRACE_MS) return true;

  try {
    const ready =
      (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!ready) return true;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancel" });
    if (r.success) lastSuccessAt = Date.now();
    return r.success;
  } catch {
    return false;
  }
}

/**
 * Spend the grace immediately.
 *
 * Called when the app locks or the active wallet changes: whatever the member confirmed a moment ago
 * they confirmed as someone else, or before deciding to lock. Either way it must not carry over.
 */
export function clearReauthGrace(): void {
  lastSuccessAt = 0;
}
