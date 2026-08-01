/**
 * Read-only Squads v4 multisig access (Phase 1 core). Thin wrapper over the official
 * audited `@sqds/multisig` SDK — no custom fund logic. Propose/approve/execute (which
 * sign with the active member's key) build on these reads in a later phase.
 */
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { connection, solscanAccount } from "./connection";
import { multisigPubkey, vaultPda, setMultisigAddress } from "../config/multisig";

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

// ---- proposals (read + vote/execute) -----------------------------------------

export interface ProposalView {
  index: number;
  /** "Active" (open to vote), "Approved" (ready to execute), "Executed", "Rejected", … */
  status: string;
  approvals: number;
  rejections: number;
  threshold: number;
  /** Human-readable action, best-effort. Unknown actions say "review before approving". */
  summary: string;
  /** Solscan link to the transaction account for manual review. */
  solscan: string;
}

function shortKey(k: PublicKey): string {
  const s = k.toBase58();
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function readU64LE(buf: Uint8Array, offset: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(buf[offset + i]) << BigInt(8 * i);
  return v;
}

/** Best-effort decode of a vault transaction into one line. SOL transfers are decoded
 *  explicitly; anything else says "review" (never claim to understand what we don't). */
function decodeVaultTx(vt: multisig.accounts.VaultTransaction): string {
  const { accountKeys, instructions } = vt.message;
  for (const ix of instructions) {
    const programId = accountKeys[ix.programIdIndex];
    if (programId.equals(SystemProgram.programId)) {
      const data = ix.data as Uint8Array;
      // System transfer: u32 discriminator = 2, then u64 lamports.
      if (data.length >= 12 && data[0] === 2 && data[1] === 0 && data[2] === 0 && data[3] === 0) {
        const lamports = Number(readU64LE(data, 4));
        const to = accountKeys[ix.accountIndexes[1]];
        return `Send ${lamports / 1e9} SOL → ${shortKey(to)}`;
      }
    }
  }
  const n = instructions.length;
  return `Custom transaction · ${n} instruction${n === 1 ? "" : "s"} — review before approving`;
}

/** Fetch recent proposals (newest first). */
export async function fetchProposals(info: MultisigInfo, limit = 15): Promise<ProposalView[]> {
  const ms = multisigPubkey();
  if (!ms) return [];
  const out: ProposalView[] = [];
  for (let i = info.transactionIndex; i > 0 && out.length < limit; i--) {
    try {
      const [proposalPda] = multisig.getProposalPda({ multisigPda: ms, transactionIndex: BigInt(i) });
      const proposal = await multisig.accounts.Proposal.fromAccountAddress(connection, proposalPda);
      const status = (proposal.status as { __kind: string }).__kind;
      const [txPda] = multisig.getTransactionPda({ multisigPda: ms, index: BigInt(i) });
      let summary = "Transaction";
      try {
        const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, txPda);
        summary = decodeVaultTx(vt);
      } catch {
        summary = "Config change — review before approving";
      }
      out.push({
        index: i,
        status,
        approvals: proposal.approved.length,
        rejections: proposal.rejected.length,
        threshold: info.threshold,
        summary,
        solscan: solscanAccount(txPda.toBase58()),
      });
    } catch {
      /* no proposal at this index (never created / draft) — skip */
    }
  }
  return out;
}

/**
 * Create a new Squads v4 multisig on-chain. The creator (active member) pays the Squads
 * creation fee + rent and is always included as a full member. `memberAddresses` are the
 * OTHER signers (base58). Persists the new multisig address on success and returns it.
 * MAINNET = real fee — test on devnet first.
 */
export async function createMultisig(
  creator: Keypair,
  memberAddresses: string[],
  threshold: number
): Promise<string> {
  const createKey = Keypair.generate(); // ephemeral seed for the multisig PDA (not a member)
  const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });

  // The Squads program treasury (where the one-time creation fee goes) lives in ProgramConfig.
  const [programConfigPda] = multisig.getProgramConfigPda({});
  const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(connection, programConfigPda);

  const keys = Array.from(new Set([creator.publicKey.toBase58(), ...memberAddresses.map((a) => a.trim())]));
  const members = keys.map((k) => ({
    key: new PublicKey(k),
    permissions: multisig.types.Permissions.all(),
  }));
  if (threshold < 1 || threshold > members.length) {
    throw new Error(`Threshold must be between 1 and ${members.length}.`);
  }

  await multisig.rpc.multisigCreateV2({
    connection,
    treasury: programConfig.treasury,
    createKey,
    creator,
    multisigPda,
    configAuthority: null, // autonomous — the members govern it, no admin key
    threshold,
    members,
    timeLock: 0,
    rentCollector: null,
  });

  const address = multisigPda.toBase58();
  await setMultisigAddress(address);
  return address;
}

/** Approve a proposal — signs & sends with the member's key (Squads enforces permissions). */
export async function approveProposal(member: Keypair, index: number): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return multisig.rpc.proposalApprove({
    connection,
    feePayer: member,
    member,
    multisigPda: ms,
    transactionIndex: BigInt(index),
  });
}

export async function rejectProposal(member: Keypair, index: number): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return multisig.rpc.proposalReject({
    connection,
    feePayer: member,
    member,
    multisigPda: ms,
    transactionIndex: BigInt(index),
  });
}

/** Execute an approved proposal — runs the (already-approved) transaction from the vault. */
export async function executeProposal(member: Keypair, index: number): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return multisig.rpc.vaultTransactionExecute({
    connection,
    feePayer: member,
    multisigPda: ms,
    transactionIndex: BigInt(index),
    member: member.publicKey,
  });
}
