/**
 * Polyfills required by @solana/web3.js in React Native. Must be imported before
 * anything that touches web3 (see index.ts — imported first).
 */
import "react-native-get-random-values"; // crypto.getRandomValues for keygen/signing
import "react-native-url-polyfill/auto"; // WHATWG URL used by web3 Connection
import { Buffer } from "buffer";

// web3 and its deps expect a global Buffer.
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}
