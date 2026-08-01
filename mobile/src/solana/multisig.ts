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
import { multisigPubkey, vaultPda, addMultisig } from "../config/multisig";

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
  await addMultisig(address);
  return address;
}

/** A built, signed, fee-estimated, pre-simulated transaction awaiting the user's confirmation. */
export interface PreparedTx {
  /** Estimated network (signature) fee in SOL — paid from the signer's own wallet. */
  feeSol: number;
  /** True when the tx opens on-chain accounts (proposing), which also locks a small refundable rent. */
  rent: boolean;
  /** A pre-flight problem: the tx simulated as failing, with the real reason. undefined = looks good. */
  warn?: string;
  /** Broadcast the prepared transaction and wait for confirmation. */
  send(): Promise<string>;
}

/** Squads custom-program error codes → plain English (restores the meaning the SDK's rpc.*
 *  would have translated; we build txs ourselves for confirmed, atomic, previewable sends). */
const SQUADS_ERROR: Record<number, string> = {
  6001: "A multisig must keep at least one signer.",
  6002: "Too many signers for one multisig.",
  6003: "That would make the approval threshold invalid — it can't be higher than the number of signers. (Removing a signer lowers the threshold automatically; recreate the proposal.)",
  6004: "Your key isn't authorized for this — it may not be a member or may lack the needed permission.",
  6005: "That address isn't a member of this multisig.",
  6007: "This proposal is stale — a later config change superseded it. Create a fresh one.",
  6008: "This proposal isn't ready to execute — it needs enough approvals and must not be already executed or cancelled.",
  6009: "Proposal index mismatch — refresh and try again.",
  6015: "You can't remove the last signer of a multisig.",
  6016: "That change would leave no one able to approve (vote).",
  6017: "That change would leave no one able to propose.",
  6018: "That change would leave no one able to execute.",
  6021: "This proposal is still time-locked and can't be executed yet.",
};

/** Turn a failed simulation (err + logs) into the REAL reason, not a generic "low SOL" guess. */
function explainSimError(err: unknown, logs: string[]): string {
  const text = logs.join(" ");
  if (/insufficient lamports|insufficient funds|debit an account but found no record/i.test(text))
    return "The vault doesn't have enough SOL/tokens to cover this transfer (plus rent for the recipient's account). Fund the vault, then try again.";
  const code = Number(JSON.stringify(err).match(/"Custom":(\d+)/)?.[1] ?? NaN);
  if (!Number.isNaN(code))
    return (
      SQUADS_ERROR[code] ??
      `The Squads program rejected this (error ${code}). Make sure the proposal is approved by enough signers and hasn't already been executed.`
    );
  const log = [...logs].reverse().find((l) => /Program log: (Error|AnchorError|failed)/i.test(l));
  if (log) return log.replace(/^.*Program log:\s*/i, "");
  return "The network rejected this transaction — it would fail on-chain.";
}

/**
 * Build + sign a legacy tx, estimate its fee, and PRE-SIMULATE it so a doomed transaction is
 * caught and explained BEFORE sending (e.g. an underfunded vault, or a not-yet-approved proposal)
 * instead of surfacing as a misleading "low SOL" error. We build the tx ourselves (not the SDK's
 * fire-and-forget rpc.*) so multi-instruction flows stay atomic + confirmed and we can preview.
 */
async function prepareTx(
  signer: Keypair,
  ixs: TransactionInstruction[],
  opts: { extraSigners?: Keypair[]; rent?: boolean } = {}
): Promise<PreparedTx> {
  const extraSigners = opts.extraSigners ?? [];
  const tx = new Transaction().add(...ixs);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = signer.publicKey;
  tx.sign(signer, ...extraSigners);

  let feeSol = 0.000005; // fallback: one signature
  try {
    const fee = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
    if (fee.value != null) feeSol = fee.value / LAMPORTS_PER_SOL;
  } catch {
    /* keep fallback */
  }

  let warn: string | undefined;
  try {
    const sim = await connection.simulateTransaction(tx);
    if (sim.value.err) warn = explainSimError(sim.value.err, sim.value.logs ?? []);
  } catch {
    /* couldn't run simulation — the real send will surface any error */
  }

  return {
    feeSol,
    rent: !!opts.rent,
    warn,
    // Refetch the blockhash at send time — the confirm dialog can sit long enough for the
    // prepared blockhash to expire; sendAndConfirmTransaction re-signs for the new one.
    send: async () => {
      const bh = await connection.getLatestBlockhash();
      tx.recentBlockhash = bh.blockhash;
      tx.lastValidBlockHeight = bh.lastValidBlockHeight;
      return sendAndConfirmTransaction(connection, tx, [signer, ...extraSigners]);
    },
  };
}

/** Prepare + immediately send (no fee preview needed, e.g. multisig creation). */
async function sendConfirmed(signer: Keypair, ixs: TransactionInstruction[], extraSigners: Keypair[] = []): Promise<string> {
  return (await prepareTx(signer, ixs, { extraSigners })).send();
}

/** Prepare an approval — the member signs; Squads enforces permissions on send. */
export async function prepareApprove(member: Keypair, index: number): Promise<PreparedTx> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return prepareTx(member, [
    multisig.instructions.proposalApprove({ multisigPda: ms, transactionIndex: BigInt(index), member: member.publicKey }),
  ]);
}

export async function prepareReject(member: Keypair, index: number): Promise<PreparedTx> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  return prepareTx(member, [
    multisig.instructions.proposalReject({ multisigPda: ms, transactionIndex: BigInt(index), member: member.publicKey }),
  ]);
}

/** Prepare execution of an approved proposal — a vault spend or a config (signer/threshold) change. */
export async function prepareExecute(member: Keypair, index: number, kind: "vault" | "config" = "vault"): Promise<PreparedTx> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  if (kind === "config") {
    return prepareTx(member, [
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
  return prepareTx(member, [instruction]);
}

// ---- config-change proposals (add/remove signer, change threshold) -----------

type ConfigAction = Parameters<typeof multisig.rpc.configTransactionCreate>[0]["actions"][number];

/** Prepare a config change — creates a config transaction + proposal the current signers must
 *  approve (then execute). Both instructions ride one confirmed transaction so the proposal sees
 *  the freshly-incremented transaction index (avoids InvalidTransactionIndex). */
async function prepareConfigChange(creator: Keypair, actions: ConfigAction[]): Promise<PreparedTx> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
  const index = BigInt(acc.transactionIndex.toString()) + 1n;
  return prepareTx(
    creator,
    [
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
    ],
    { rent: true }
  );
}

export async function prepareAddSigner(creator: Keypair, address: string): Promise<PreparedTx> {
  return prepareConfigChange(creator, [
    { __kind: "AddMember", newMember: { key: new PublicKey(address), permissions: multisig.types.Permissions.all() } },
  ]);
}

export async function prepareRemoveSigner(creator: Keypair, address: string): Promise<PreparedTx> {
  const ms = multisigPubkey();
  if (!ms) throw new Error("No multisig configured.");
  const acc = await multisig.accounts.Multisig.fromAccountAddress(connection, ms);
  const newCount = acc.members.length - 1;
  if (newCount < 1) throw new Error("A multisig must keep at least one signer.");
  const actions: ConfigAction[] = [];
  // Squads rejects threshold > members, so lower the threshold FIRST when the removal would
  // otherwise leave it too high (e.g. 2-of-2 → remove one → must become 1-of-1).
  if (acc.threshold > newCount) actions.push({ __kind: "ChangeThreshold", newThreshold: newCount });
  actions.push({ __kind: "RemoveMember", oldMember: new PublicKey(address) });
  return prepareConfigChange(creator, actions);
}

export async function prepareChangeThreshold(creator: Keypair, newThreshold: number): Promise<PreparedTx> {
  return prepareConfigChange(creator, [{ __kind: "ChangeThreshold", newThreshold }]);
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
 * Prepare a transfer OUT of the multisig vault. Wraps a SOL or SPL transfer (executed by the
 * vault PDA) in a Squads vault transaction + proposal the members must approve, then execute.
 * Signed by the proposing member; the vault itself only moves funds on execution after the
 * threshold approves. `to` is the recipient (base58). Returns a PreparedTx (fee + simulation).
 */
export async function prepareTransfer(
  creator: Keypair,
  to: string,
  uiAmount: number,
  asset: TransferAsset
): Promise<PreparedTx> {
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
  return prepareTx(
    creator,
    [
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
    ],
    { rent: true }
  );
}
