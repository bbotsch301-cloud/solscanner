/**
 * Squads Protocol v4 multisig treasury config.
 *
 * The multisig is created once via the audited hosted app (app.squads.so), then its
 * address is set here (or via EXPO_PUBLIC_MULTISIG). Empty = no multisig treasury; the
 * app falls back to the plain treasury address. We only ever wrap Squads' official
 * audited program — never custom fund logic.
 */
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

/** The Squads multisig account address (base58). Set after creating the Squad. */
export const MULTISIG_ADDRESS = process.env.EXPO_PUBLIC_MULTISIG ?? "";

/** Squads v4 on-chain program — verify against squads.so/github before mainnet use. */
export const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID;

export function multisigConfigured(): boolean {
  return MULTISIG_ADDRESS.trim().length > 0;
}

export function multisigPubkey(): PublicKey | null {
  try {
    return multisigConfigured() ? new PublicKey(MULTISIG_ADDRESS) : null;
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
