/**
 * EVM message signing for WalletConnect: EIP-191 personal_sign. Returns the
 * 65-byte r‖s‖v signature a verifying contract's ecrecover expects (v = 27/28).
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "./tx";

const enc = (s: string) => new TextEncoder().encode(s);

/** Hash a message the personal_sign way: keccak256("\x19Ethereum Signed Message:\n" + len + msg). */
export function hashPersonalMessage(message: string): Uint8Array {
  const msg = message.startsWith("0x") ? hexToBytes(message) : enc(message);
  const prefix = enc(`\x19Ethereum Signed Message:\n${msg.length}`);
  return keccak_256(new Uint8Array([...prefix, ...msg]));
}

/** Sign a 32-byte digest, returning 0x r(32) s(32) v(1), v = recovery + 27. */
export function signDigest(digest: Uint8Array, privateKey: Uint8Array): string {
  const sig = secp256k1.sign(digest, privateKey);
  const r = sig.r.toString(16).padStart(64, "0");
  const s = sig.s.toString(16).padStart(64, "0");
  const v = (sig.recovery + 27).toString(16).padStart(2, "0");
  return "0x" + r + s + v;
}

/** EIP-191 personal_sign. */
export function personalSign(message: string, privateKey: Uint8Array): string {
  return signDigest(hashPersonalMessage(message), privateKey);
}

export { bytesToHex };
