/**
 * EVM (Ethereum / BNB Smart Chain) account derivation from the SAME BIP39 mnemonic
 * as the Solana wallet. EVM uses secp256k1 at BIP44 path m/44'/60'/0'/0/0 (the
 * MetaMask/Ledger default), so importing the recovery phrase into any EVM wallet
 * yields this exact address — one seed, every chain, one backup.
 *
 * Pure-JS noble stack (same family as the hand-rolled Solana derivation) so it
 * bundles cleanly in React Native. Verified against a known test vector.
 */
import * as bip39 from "bip39";
import { HDKey } from "@scure/bip32";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";
import { normalizeMnemonic } from "./mnemonic";

// m/44'/60'/0'/0/<account> — MetaMask/Phantom account numbering, so account N here
// == the same 0x address MetaMask/Phantom show for their account N.
const evmPath = (account: number) => `m/44'/60'/0'/0/${account}`;

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** Apply the EIP-55 mixed-case checksum to a 0x address. */
export function toChecksumAddress(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, "");
  const hash = toHex(keccak_256(new TextEncoder().encode(lower)));
  let out = "0x";
  for (let i = 0; i < lower.length; i++) {
    out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

/** True for a syntactically valid 0x-prefixed 20-byte address. */
export function isEvmAddress(address: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(address.trim());
}

export interface EvmAccount {
  /** EIP-55 checksummed address. */
  address: string;
  /** 32-byte secp256k1 private key. */
  privateKey: Uint8Array;
}

/**
 * Derive the EVM account. The optional BIP39 passphrase (the "25th word") is
 * folded into the seed — NFKD-normalized per BIP39, case preserved — same rules as
 * the Solana derivation, so one passphrase covers both chains from the same phrase.
 */
export function deriveEvmAccount(mnemonic: string, passphrase = "", account = 0): EvmAccount {
  const seed = bip39.mnemonicToSeedSync(normalizeMnemonic(mnemonic), passphrase);
  const hd = HDKey.fromMasterSeed(new Uint8Array(seed)).derive(evmPath(account));
  if (!hd.privateKey) throw new Error("Could not derive the EVM account.");
  const privateKey = hd.privateKey;
  // Uncompressed public key: 0x04 || X(32) || Y(32); address = last 20 bytes of
  // keccak256 over the 64-byte X||Y.
  const pub = secp256k1.getPublicKey(privateKey, false);
  const hash = keccak_256(pub.slice(1));
  const address = toChecksumAddress("0x" + toHex(hash.slice(-20)));
  return { address, privateKey };
}
