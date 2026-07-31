/**
 * Keypair persistence. The secret key lives in the device keychain via
 * expo-secure-store — it never leaves the device and is not in JS-accessible
 * storage. Devnet only for now; the same store carries into mainnet later.
 */
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";

const SECRET_KEY = "solwallet.secretKey.v1";

export async function loadKeypair(): Promise<Keypair | null> {
  const stored = await SecureStore.getItemAsync(SECRET_KEY);
  if (!stored) return null;
  try {
    const secret = Uint8Array.from(JSON.parse(stored) as number[]);
    return Keypair.fromSecretKey(secret);
  } catch {
    return null;
  }
}

export async function createKeypair(): Promise<Keypair> {
  const kp = Keypair.generate();
  await SecureStore.setItemAsync(
    SECRET_KEY,
    JSON.stringify(Array.from(kp.secretKey))
  );
  return kp;
}

export async function clearKeypair(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY);
}
