/**
 * Which chain an address belongs to, decided from the address alone.
 *
 * Lifted out of `contacts/contacts.ts`, which owns contact storage and imports AsyncStorage — so
 * "is this a Solana address" could not be answered without loading React Native, and the scanner's
 * parser could not be tested. The question isn't about contacts; it's about addresses.
 *
 * `contacts.ts` re-exports both names, so nothing that imported them from there had to change.
 */
import { PublicKey } from "@solana/web3.js";
import { isEvmAddress } from "../wallet/evm";

export type AddressKind = "solana" | "evm";

/** base58 (Solana) vs 0x (EVM), or null if the string isn't a valid address on either. */
export function detectKind(address: string): AddressKind | null {
  const a = address.trim();
  if (isEvmAddress(a)) return "evm";
  try {
    return new PublicKey(a) ? "solana" : null;
  } catch {
    return null;
  }
}
