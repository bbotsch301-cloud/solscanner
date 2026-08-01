/**
 * Read-only Squads v4 multisig access (Phase 1 core). Thin wrapper over the official
 * audited `@sqds/multisig` SDK — no custom fund logic. Propose/approve/execute (which
 * sign with the active member's key) build on these reads in a later phase.
 */
import * as multisig from "@sqds/multisig";
import { connection } from "./connection";
import { multisigPubkey, vaultPda } from "../config/multisig";

export interface MultisigMember {
  key: string;
  /** Squads permission bitmask (Propose=1, Vote=2, Execute=4). */
  permissions: number;
}

export interface MultisigInfo {
  address: string;
  vault: string;
  threshold: number;
  members: MultisigMember[];
  /** Highest transaction index — the next proposal is this + 1. */
  transactionIndex: number;
}

/** Read the multisig config (members, threshold, vault). Null if not configured/readable. */
export async function fetchMultisigInfo(): Promise<MultisigInfo | null> {
  const ms = multisigPubkey();
  const vault = vaultPda();
  if (!ms || !vault) return null;
  try {
    const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
    return {
      address: ms.toBase58(),
      vault: vault.toBase58(),
      threshold: acc.threshold,
      members: acc.members.map((m) => ({ key: m.key.toBase58(), permissions: m.permissions.mask })),
      transactionIndex: Number(acc.transactionIndex.toString()),
    };
  } catch {
    return null;
  }
}

/** True if `address` is a member of the multisig. */
export function isMember(info: MultisigInfo | null, address: string | null): boolean {
  if (!info || !address) return false;
  return info.members.some((m) => m.key === address);
}
