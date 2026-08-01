/**
 * Squads Protocol v4 multisig treasury config.
 *
 * The multisig address can come from (in priority): a Squad created in-app (stored on the
 * device), or EXPO_PUBLIC_MULTISIG. Empty = no multisig treasury; the app falls back to the
 * plain treasury address. We only ever wrap Squads' official audited program.
 */
import * as SecureStore from "expo-secure-store";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const STORE_KEY = "solwallet.multisig.v1";

// Live value: the stored (in-app-created) address wins over the env default.
let multisigAddress = process.env.EXPO_PUBLIC_MULTISIG ?? "";

/** Squads v4 on-chain program — verify against squads.so/github before mainnet use. */
export const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID;

/** Load the stored multisig address (call once at startup, before rendering). */
export async function loadMultisigPref(): Promise<void> {
  try {
    const v = await SecureStore.getItemAsync(STORE_KEY);
    if (v) multisigAddress = v;
  } catch {
    /* keep env default */
  }
}

/** Persist (or clear) the active multisig address. */
export async function setMultisigAddress(addr: string): Promise<void> {
  multisigAddress = addr;
  try {
    if (addr) await SecureStore.setItemAsync(STORE_KEY, addr);
    else await SecureStore.deleteItemAsync(STORE_KEY);
  } catch {
    /* best-effort */
  }
}

export function multisigConfigured(): boolean {
  return multisigAddress.trim().length > 0;
}

export function multisigPubkey(): PublicKey | null {
  try {
    return multisigConfigured() ? new PublicKey(multisigAddress) : null;
  } catch {
    return null;
  }
}

/** The default vault (index 0) that holds the treasury funds. */
export function vaultPda(): PublicKey | null {
  const ms = multisigPubkey();
  if (!ms) return null;
  const [pda] = multisig.getVaultPda({ multisigPda: ms, index: 0 });
  return pda;
}
