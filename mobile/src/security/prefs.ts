import * as SecureStore from "expo-secure-store";

/**
 * Local security preferences, loaded at startup (before AuthProvider / WalletProvider
 * decide the initial lock state) and toggled in Settings.
 *
 * The app PIN (see wallet/lock.ts) is the primary lock. Biometric (Face ID / passcode)
 * is an optional convenience lock, OFF by default — the user must explicitly turn it on.
 */
const BIOMETRIC_KEY = "solwallet.biometric.v1";
const PIN_PROMPTED_KEY = "solwallet.pinPrompted.v1";
const NOTIFICATIONS_KEY = "solwallet.notifications.v1";
const LEGAL_ACCEPTED_KEY = "solwallet.legalAccepted.v1";

let biometricEnabled = false;
let pinPrompted = false;
let notificationsEnabled = false;
let acceptedLegalVersion = 0;

export function isBiometricEnabled(): boolean {
  return biometricEnabled;
}

/** True if the user turned on "notify me when funds arrive" (off by default). */
export function isNotificationsEnabled(): boolean {
  return notificationsEnabled;
}

/** True once the user has been offered to set a PIN (so we only offer once). */
export function isPinPrompted(): boolean {
  return pinPrompted;
}

/** Highest legal-documents version the user has accepted (0 = never). Compared against
 *  LEGAL_VERSION so a bumped version re-triggers the first-run acceptance gate. */
export function getAcceptedLegalVersion(): number {
  return acceptedLegalVersion;
}

export async function loadSecurityPref(): Promise<void> {
  try {
    const [bio, prompted, notif, legal] = await Promise.all([
      SecureStore.getItemAsync(BIOMETRIC_KEY),
      SecureStore.getItemAsync(PIN_PROMPTED_KEY),
      SecureStore.getItemAsync(NOTIFICATIONS_KEY),
      SecureStore.getItemAsync(LEGAL_ACCEPTED_KEY),
    ]);
    biometricEnabled = bio === "on"; // default off unless explicitly enabled
    pinPrompted = prompted === "1";
    notificationsEnabled = notif === "on";
    acceptedLegalVersion = legal ? parseInt(legal, 10) || 0 : 0;
  } catch {
    /* keep defaults (biometric off, not prompted) */
  }
}

/** Record that the user accepted the legal documents at version `v`. */
export async function setAcceptedLegalVersion(v: number): Promise<void> {
  acceptedLegalVersion = v;
  try {
    await SecureStore.setItemAsync(LEGAL_ACCEPTED_KEY, String(v));
  } catch {
    /* best-effort */
  }
}

export async function setNotificationsEnabled(v: boolean): Promise<void> {
  notificationsEnabled = v;
  try {
    await SecureStore.setItemAsync(NOTIFICATIONS_KEY, v ? "on" : "off");
  } catch {
    /* best-effort */
  }
}

export async function setBiometricEnabled(v: boolean): Promise<void> {
  biometricEnabled = v;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_KEY, v ? "on" : "off");
  } catch {
    /* best-effort */
  }
}

export async function setPinPrompted(): Promise<void> {
  pinPrompted = true;
  try {
    await SecureStore.setItemAsync(PIN_PROMPTED_KEY, "1");
  } catch {
    /* best-effort */
  }
}

export async function clearPinPrompted(): Promise<void> {
  pinPrompted = false;
  try {
    await SecureStore.deleteItemAsync(PIN_PROMPTED_KEY);
  } catch {
    /* best-effort */
  }
}
