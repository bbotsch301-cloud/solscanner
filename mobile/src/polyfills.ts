/**
 * Polyfills required by @solana/web3.js in React Native. Must be imported before
 * anything that touches web3 (see index.ts — imported first).
 *
 * INVARIANT: `react-native-get-random-values` must be the FIRST import here, and this
 * module must be the FIRST import in index.ts. @noble/hashes captures `globalThis.crypto`
 * once at load; if anything that transitively pulls @noble/hashes or @solana/web3.js
 * loaded before this line, secure keygen would break. Do not reorder. The keygen-time
 * entropy guard (wallet/entropy.ts) is the hard backstop; the check below just surfaces
 * a regression loudly during development.
 */
import "react-native-get-random-values"; // crypto.getRandomValues for keygen/signing
import "react-native-url-polyfill/auto"; // WHATWG URL used by web3 Connection
import { Buffer } from "buffer";

// Surface (without crashing) a broken secure-RNG install in dev — real users only ever
// need the RNG for wallet creation, which is separately guarded and fails closed.
if (
  typeof __DEV__ !== "undefined" &&
  __DEV__ &&
  typeof (global as { crypto?: { getRandomValues?: unknown } }).crypto?.getRandomValues !== "function"
) {
  console.warn(
    "[polyfills] crypto.getRandomValues was not installed — check import order; secure key generation would be blocked."
  );
}

// web3 and its deps expect a global Buffer.
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}
