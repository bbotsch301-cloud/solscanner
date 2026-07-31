/**
 * Hard entropy guard for key generation.
 *
 * A wallet's whole security rests on the randomness used to create its seed. The
 * Coldcard Mk3 thefts (July 2025) were keys minted with weak entropy — computable
 * from first principles. This module refuses to create a wallet unless a real OS
 * CSPRNG is producing the bytes.
 *
 * The one theoretical weak path in our stack is `react-native-get-random-values`,
 * which falls back to `Math.random()` ONLY under legacy Chrome remote JS-debugging
 * (`__DEV__` and no `nativeCallSyncHook`, non-bridgeless). On Expo SDK 48+ the
 * native `ExpoCrypto` path is already used unconditionally, so this can't happen to
 * a shipped user — but we make the guarantee explicit and fail loudly rather than
 * ever mint a key from `Math.random()` bytes.
 */

export const ENTROPY_ERROR =
  "Your device isn't providing secure randomness right now, so we won't create a " +
  "wallet — keys generated without it could be guessed and your funds stolen. This " +
  "shouldn't happen on a normal install. Close any remote JS debugger, fully restart " +
  "the app, and try again. If it keeps happening, do not use this wallet to hold funds " +
  "until it's resolved.";

/** True when RN would fall back to `Math.random()` for `crypto.getRandomValues`. */
function onInsecureDebugPath(): boolean {
  const g = globalThis as unknown as {
    RN$Bridgeless?: boolean;
    expo?: { modules?: { ExpoCrypto?: { getRandomValues?: unknown } } };
    nativeCallSyncHook?: unknown;
    __DEV__?: boolean;
  };
  // Bridgeless (new architecture) never uses the insecure path.
  if ("RN$Bridgeless" in g && g.RN$Bridgeless === true) return false;
  // Expo SDK 48+ routes getRandomValues through native ExpoCrypto unconditionally.
  if (g.expo?.modules?.ExpoCrypto?.getRandomValues) return false;
  // The exact condition react-native-get-random-values uses to pick Math.random.
  const dev = typeof __DEV__ !== "undefined" ? __DEV__ : g.__DEV__ === true;
  return !!dev && typeof g.nativeCallSyncHook === "undefined";
}

/**
 * A basic smoke test that the RNG is present and not stuck/degenerate. Cannot by
 * itself distinguish a good CSPRNG from Math.random (both look random), which is why
 * onInsecureDebugPath() exists — but it does catch a broken or absent generator.
 */
function producesNonDegenerateBytes(): boolean {
  const crypto = (globalThis as unknown as { crypto?: Crypto }).crypto;
  if (!crypto || typeof crypto.getRandomValues !== "function") return false;
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  const allZero = a.every((b) => b === 0);
  const allSame = a.every((b) => b === a[0]);
  return !allZero && !allSame;
}

/**
 * Throw (with a plain-English message) unless secure entropy is available. Call this
 * immediately before generating any new seed. Deterministic derivation from an
 * existing seed does not need it — only fresh key creation does.
 */
export function assertSecureEntropy(): void {
  if (onInsecureDebugPath() || !producesNonDegenerateBytes()) {
    throw new Error(ENTROPY_ERROR);
  }
}
