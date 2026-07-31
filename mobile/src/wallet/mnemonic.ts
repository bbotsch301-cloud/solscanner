/**
 * BIP39 recovery-phrase support. New wallets are generated with a 24-word (256-bit)
 * mnemonic for maximum entropy, and derived at Solana's standard path
 * (m/44'/501'/0'/0'), so they can be backed up/restored and are compatible with
 * Phantom / Solflare. Importing 12- or 24-word phrases is fully supported.
 *
 * SLIP-0010 ed25519 derivation is implemented here with @noble/hashes (pure JS)
 * rather than ed25519-hd-key, which pulls Node's `stream` and won't bundle in RN.
 */
import * as bip39 from "bip39";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { Keypair } from "@solana/web3.js";

const ED25519_SEED = new TextEncoder().encode("ed25519 seed");
const HARDENED_OFFSET = 0x80000000;
// m/44'/501'/0'/0' — every segment is hardened for ed25519.
const SOLANA_PATH = [44, 501, 0, 0];

function deriveEd25519Seed(seed: Uint8Array): Uint8Array {
  let I = hmac(sha512, ED25519_SEED, seed);
  let key = I.slice(0, 32);
  let chainCode = I.slice(32);
  for (const segment of SOLANA_PATH) {
    const index = (segment + HARDENED_OFFSET) >>> 0;
    const data = new Uint8Array(37);
    data[0] = 0x00;
    data.set(key, 1);
    data[33] = (index >>> 24) & 0xff;
    data[34] = (index >>> 16) & 0xff;
    data[35] = (index >>> 8) & 0xff;
    data[36] = index & 0xff;
    I = hmac(sha512, chainCode, data);
    key = I.slice(0, 32);
    chainCode = I.slice(32);
  }
  return key;
}

/** Generate a fresh 24-word (256-bit) mnemonic. Import still accepts 12 or 24 words. */
/** Normalize a phrase: lowercase, and collapse any whitespace (newlines, tabs,
 * double spaces) to single spaces so a valid phrase isn't rejected on formatting. */
export function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().replace(/\s+/g, " ");
}

export function generateMnemonic(): string {
  return bip39.generateMnemonic(256);
}

export function validateMnemonic(mnemonic: string): boolean {
  return bip39.validateMnemonic(normalizeMnemonic(mnemonic));
}

/**
 * Derive the Solana keypair for a mnemonic. An optional BIP39 passphrase (the
 * "25th word") is folded into the seed exactly as typed — it is case-sensitive
 * and NOT normalized, and a different passphrase yields a completely different,
 * still-valid wallet (there is no "wrong passphrase" error). Empty string = the
 * standard no-passphrase wallet, matching Phantom/Solflare/MetaMask defaults.
 */
export function keypairFromMnemonic(mnemonic: string, passphrase = ""): Keypair {
  const seed = bip39.mnemonicToSeedSync(normalizeMnemonic(mnemonic), passphrase);
  const derived = deriveEd25519Seed(new Uint8Array(seed));
  return Keypair.fromSeed(derived);
}
