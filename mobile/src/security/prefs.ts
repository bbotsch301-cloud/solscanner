import * as SecureStore from "expo-secure-store";

/**
 * Whether the wallet requires Face ID / passcode to unlock. Loaded at startup
 * (before AuthProvider decides the initial locked state) and toggled in Settings.
 */
const KEY = "solwallet.biometric.v1";
let biometricEnabled = true;

export function isBiometricEnabled(): boolean {
  return biometricEnabled;
}

export async function loadSecurityPref(): Promise<void> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v === "off") biometricEnabled = false;
  } catch {
    /* keep default (on) */
  }
}

export async function setBiometricEnabled(v: boolean): Promise<void> {
  biometricEnabled = v;
  try {
    await SecureStore.setItemAsync(KEY, v ? "on" : "off");
  } catch {
    /* best-effort */
  }
}
