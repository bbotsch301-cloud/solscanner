/**
 * Fresh biometric / device-passcode confirmation before signing a fund-moving request (dApp
 * browser or WalletConnect). Only gates when the wallet has a lock set; if the device has no
 * biometric/passcode enrolled we can't prompt, so we don't block (app-entry lock already gated
 * access). Shared by WalletConnect and the in-app browser so both use the identical gate.
 */
import * as LocalAuthentication from "expo-local-authentication";
import { pinEnabled } from "../wallet/lock";
import { isBiometricEnabled } from "./prefs";

export async function requireReauth(promptMessage = "Confirm this request"): Promise<boolean> {
  if (!pinEnabled() && !isBiometricEnabled()) return true;
  try {
    const ready =
      (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
    if (!ready) return true;
    const r = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancel" });
    return r.success;
  } catch {
    return false;
  }
}
