/**
 * Read-only Squads v4 multisig access (Phase 1 core). Thin wrapper over the official
 * audited `@sqds/multisig` SDK — no custom fund logic. Propose/approve/execute (which
 * sign with the active member's key) build on these reads in a later phase.
 */
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
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

/**
 * Validate + read a multisig by an arbitrary address WITHOUT persisting it — backs the
 * "connect an existing multisig" flow. Returns its info, or null if the address isn't a
 * readable Squads multisig (bad base58, wrong account type, or not found).
 */
export async function inspectMultisig(address: string): Promise<MultisigInfo | null> {
  let ms: PublicKey;
  try {
    ms = new PublicKey(address.trim());
  } catch {
    return null;
  }
  try {
    const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
    const [vault] = multisig.getVaultPda({ multisigPda: ms, index: 0 });
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
  /** "vault" = spend a token/SOL; "config" = change signers/threshold. */
  kind: "vault" | "config";
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

/** Decode a config transaction (signer/threshold changes) into one line. */
function decodeConfigTx(ct: multisig.accounts.ConfigTransaction): string {
  return ct.actions
    .map((a) => {
      switch (a.__kind) {
        case "AddMember":
          return `Add signer ${shortKey(a.newMember.key)}`;
        case "RemoveMember":
          return `Remove signer ${shortKey(a.oldMember)}`;
        case "ChangeThreshold":
          return `Change approvals to ${a.newThreshold}`;
        default:
          return a.__kind;
      }
    })
    .join(" · ");
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
      let kind: "vault" | "config" = "vault";
      try {
        const vt = await multisig.accounts.VaultTransaction.fromAccountAddress(connection, txPda);
        summary = decodeVaultTx(vt);
        kind = "vault";
      } catch {
        try {
          const ct = await multisig.accounts.ConfigTransaction.fromAccountAddress(connection, txPda);
          summary = decodeConfigTx(ct);
          kind = "config";
        } catch {
          summary = "Transaction — review before approving";
        }
      }
      out.push({
        index: i,
        kind,
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

  // Confirm the creation before returning, so the caller can immediately read/propose against
  // it. createKey is an ephemeral signer that authorizes the PDA derivation (not a member).
  await sendConfirmed(
    creator,
    [
      multisig.instructions.multisigCreateV2({
        treasury: programConfig.treasury,
        createKey: createKey.publicKey,
        creator: creator.publicKey,
        multisigPda,
        configAuthority: null, // autonomous — the members govern it, no admin key
        threshold,
        members,
        timeLock: 0,
        rentCollector: null,
      }),
    ],
    [createKey]
  );

  const address = multisigPda.toBase58();
  await setMultisigAddress(address);
  return address;
}

/**
 * Build a legacy transaction from instructions, sign with `signer`, and WAIT for confirmation.
 *
 * The SDK's `rpc.*` helpers only `sendTransaction` (fire-and-forget, no confirm), which races
 * any flow that spans more than one instruction: e.g. create-then-proposalCreate would send the
 * proposal before the create landed, so the on-chain `transactionIndex` was still stale →
 * `InvalidTransactionIndex (6009)`. Composing the instructions into one confirmed transaction
 * makes the index update visible to the proposal within the same execution, and confirming
 * means the UI reload afterwards reflects the new state.
 */
async function sendConfirmed(
  signer: Keypair,
  ixs: TransactionInstruction[],
  extraSigners: Keypair[] = []
): Promise<string> {
  const tx = new Transaction().add(...ixs);
  return sendAndConfirmTransaction(connection, tx, [signer, ...extraSigners]);
}

/** Approve a proposal — signs & sends with the member's key (Squads enforces permissions). */
export async function approveProposal(member: Keypair, index: number): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return sendConfirmed(member, [
    multisig.instructions.proposalApprove({
      multisigPda: ms,
      transactionIndex: BigInt(index),
      member: member.publicKey,
    }),
  ]);
}

export async function rejectProposal(member: Keypair, index: number): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return sendConfirmed(member, [
    multisig.instructions.proposalReject({
      multisigPda: ms,
      transactionIndex: BigInt(index),
      member: member.publicKey,
    }),
  ]);
}

/** Execute an approved proposal — a vault spend or a config (signer/threshold) change. */
export async function executeProposal(
  member: Keypair,
  index: number,
  kind: "vault" | "config" = "vault"
): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  if (kind === "config") {
    return sendConfirmed(member, [
      multisig.instructions.configTransactionExecute({
        multisigPda: ms,
        transactionIndex: BigInt(index),
        member: member.publicKey,
        rentPayer: member.publicKey,
      }),
    ]);
  }
  // Our vault transfers use no address lookup tables, so a legacy tx is sufficient.
  const { instruction } = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda: ms,
    transactionIndex: BigInt(index),
    member: member.publicKey,
  });
  return sendConfirmed(member, [instruction]);
}

// ---- config-change proposals (add/remove signer, change threshold) -----------

type ConfigAction = Parameters<typeof multisig.rpc.configTransactionCreate>[0]["actions"][number];

/** Propose a config change — creates a config transaction + proposal the current signers
 *  must approve (then execute). Both instructions ride one confirmed transaction so the
 *  proposal sees the freshly-incremented transaction index (avoids InvalidTransactionIndex). */
async function proposeConfigChange(creator: Keypair, actions: ConfigAction[]): Promise<string> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
  const index = BigInt(acc.transactionIndex.toString()) + 1n;
  return sendConfirmed(creator, [
    multisig.instructions.configTransactionCreate({
      multisigPda: ms,
      transactionIndex: index,
      creator: creator.publicKey,
      actions,
    }),
    multisig.instructions.proposalCreate({
      multisigPda: ms,
      transactionIndex: index,
      creator: creator.publicKey,
    }),
  ]);
}

export async function proposeAddSigner(creator: Keypair, address: string): Promise<string> {
  return proposeConfigChange(creator, [
    { __kind: "AddMember", newMember: { key: new PublicKey(address), permissions: multisig.types.Permissions.all() } },
  ]);
}

export async function proposeRemoveSigner(creator: Keypair, address: string): Promise<string> {
  return proposeConfigChange(creator, [{ __kind: "RemoveMember", oldMember: new PublicKey(address) }]);
}

export async function proposeChangeThreshold(creator: Keypair, newThreshold: number): Promise<string> {
  return proposeConfigChange(creator, [{ __kind: "ChangeThreshold", newThreshold }]);
}

// ---- spend proposals (transfer SOL/SPL out of the vault) ----------------------

export interface TransferAsset {
  /** "sol" = native lamports; "spl" = an SPL/Token-2022 mint. */
  kind: "sol" | "spl";
  /** Mint address (spl only). */
  mint?: string;
  decimals: number;
  symbol: string;
}

/**
 * Propose a transfer OUT of the multisig vault. Wraps a SOL or SPL transfer (executed by the
 * vault PDA) in a Squads vault transaction + proposal the members must approve, then execute.
 * Signed here by the proposing member; the vault itself only moves funds on execution after
 * the threshold approves. `to` is the recipient (base58). Returns the proposal signature.
 */
export async function proposeTransfer(
  creator: Keypair,
  to: string,
  uiAmount: number,
  asset: TransferAsset
): Promise<string> {
  const ms = multisigPubkey();
  const vault = vaultPda();
  if (!ms || !vault) throw new Error("No multisig configured.");
  const toPk = new PublicKey(to); // throws on an invalid address
  if (!(uiAmount > 0)) throw new Error("Enter an amount greater than zero.");

  const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
  const index = BigInt(acc.transactionIndex.toString()) + 1n;

  // Inner instructions the VAULT executes (vault PDA is the payer/authority of these).
  const ixs: TransactionInstruction[] = [];
  if (asset.kind === "sol") {
    ixs.push(
      SystemProgram.transfer({
        fromPubkey: vault,
        toPubkey: toPk,
        lamports: Math.round(uiAmount * LAMPORTS_PER_SOL),
      })
    );
  } else {
    const mintPk = new PublicKey(asset.mint ?? "");
    const mintInfo = await connection.getAccountInfo(mintPk);
    const programId = mintInfo?.owner.equals(TOKEN_2022_PROGRAM_ID)
      ? TOKEN_2022_PROGRAM_ID
      : TOKEN_PROGRAM_ID;
    // Vault + recipient are (or may be) PDAs/off-curve, so allowOwnerOffCurve = true.
    const fromAta = await getAssociatedTokenAddress(mintPk, vault, true, programId);
    const toAta = await getAssociatedTokenAddress(mintPk, toPk, true, programId);
    const toInfo = await connection.getAccountInfo(toAta);
    if (!toInfo) {
      // The vault pays rent for the recipient's token account (it signs these inner ixs).
      ixs.push(createAssociatedTokenAccountInstruction(vault, toAta, toPk, mintPk, programId));
    }
    const raw = BigInt(Math.round(uiAmount * 10 ** asset.decimals));
    ixs.push(
      createTransferCheckedInstruction(fromAta, mintPk, toAta, vault, raw, asset.decimals, [], programId)
    );
  }

  const { blockhash } = await connection.getLatestBlockhash();
  const transactionMessage = new TransactionMessage({
    payerKey: vault,
    recentBlockhash: blockhash,
    instructions: ixs,
  });

  // Create the vault transaction + its proposal in one confirmed tx so the proposal sees the
  // freshly-incremented transaction index (otherwise: InvalidTransactionIndex).
  return sendConfirmed(creator, [
    multisig.instructions.vaultTransactionCreate({
      multisigPda: ms,
      transactionIndex: index,
      creator: creator.publicKey,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage,
      memo: `Send ${uiAmount} ${asset.symbol}`,
    }),
    multisig.instructions.proposalCreate({
      multisigPda: ms,
      transactionIndex: index,
      creator: creator.publicKey,
    }),
  ]);
}
