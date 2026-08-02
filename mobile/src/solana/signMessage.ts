/**
 * ed25519 message signing — proving control of a Solana key without moving funds.
 *
 * This existed twice, having drifted apart: `walletconnect/handlers.ts` (base58 in/out) and
 * `browser/signer.ts` (base64 in/out). Both now call in here, keeping their own encoding at the
 * boundary where it belongs; only the crypto is shared.
 */
import type { Keypair } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";

/**
 * Sign raw bytes with the keypair's private key.
 *
 * The `slice(0, 32)` matters: Solana's `secretKey` is 64 bytes (seed ‖ pubkey) while noble expects
 * the 32-byte seed alone. Passing all 64 produces a signature that verifies nowhere — the single
 * easiest thing to get wrong here.
 */
export function signMessageBytes(kp: Keypair, message: Uint8Array): Uint8Array {
  return ed25519.sign(message, kp.secretKey.slice(0, 32));
}

/** Sign UTF-8 text — the shape auth challenges take. */
export function signMessageUtf8(kp: Keypair, text: string): Uint8Array {
  return signMessageBytes(kp, new TextEncoder().encode(text));
}
