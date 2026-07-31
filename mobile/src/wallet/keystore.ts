/**
 * Keypair persistence. New wallets are derived from a BIP39 mnemonic; both the
 * mnemonic and the derived secret key live in the device keychain via
 * expo-secure-store. Legacy wallets (created before recovery phrases) are still
 * loaded from their stored secret key.
 */
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import { generateMnemonic, keypairFromMnemonic, validateMnemonic } from "./mnemonic";

const SECRET_KEY = "solwallet.secretKey.v1";
const MNEMONIC = "solwallet.mnemonic.v1";
const NEEDS_BACKUP = "solwallet.needsBackup.v1";

/** True when a freshly-created wallet hasn't been backed up yet. */
export async function getNeedsBackup(): Promise<boolean> {
  return (await SecureStore.getItemAsync(NEEDS_BACKUP)) === "1";
}

export async function setNeedsBackup(v: boolean): Promise<void> {
  if (v) await SecureStore.setItemAsync(NEEDS_BACKUP, "1");
  else await SecureStore.deleteItemAsync(NEEDS_BACKUP);
}

async function persist(mnemonic: string | null, kp: Keypair): Promise<void> {
  if (mnemonic) await SecureStore.setItemAsync(MNEMONIC, mnemonic);
  await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(Array.from(kp.secretKey)));
}

export async function loadKeypair(): Promise<Keypair | null> {
  try {
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC);
    if (mnemonic) return keypairFromMnemonic(mnemonic);
    const stored = await SecureStore.getItemAsync(SECRET_KEY);
    if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
    return null;
  } catch {
    return null;
  }
}

/** Create a fresh mnemonic-backed wallet. Marks it as needing backup. */
export async function createKeypair(): Promise<Keypair> {
  const mnemonic = generateMnemonic();
  const kp = keypairFromMnemonic(mnemonic);
  await persist(mnemonic, kp);
  await setNeedsBackup(true);
  return kp;
}

/** Restore a wallet from a recovery phrase. Throws if the phrase is invalid. */
export async function importMnemonic(mnemonic: string): Promise<Keypair> {
  const phrase = mnemonic.trim().toLowerCase();
  if (!validateMnemonic(phrase)) throw new Error("That recovery phrase isn't valid.");
  const kp = keypairFromMnemonic(phrase);
  await persist(phrase, kp);
  await setNeedsBackup(false); // restored wallets are already backed up
  return kp;
}

/** The stored recovery phrase, or null for legacy wallets without one. */
export async function getMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC);
}

export async function clearKeypair(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY);
  await SecureStore.deleteItemAsync(MNEMONIC);
  await SecureStore.deleteItemAsync(NEEDS_BACKUP);
}
