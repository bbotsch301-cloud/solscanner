/**
 * Permanently destroying a worthless NFT and reclaiming its rent.
 *
 * Every SPL token account a wallet holds locks up ~0.00204 SOL of rent-exempt deposit. Junk
 * airdrops are therefore not merely clutter: each one costs the recipient a small amount of SOL
 * they can only get back by burning the token and closing the account. This does both in a single
 * transaction, so the item is gone and the rent lands back in the wallet.
 *
 * Deliberately narrow. The transaction is irreversible, so anything that can't be burned cleanly is
 * refused UP FRONT with a reason (`burnPreflight`) rather than failing halfway through:
 *
 *   • compressed — cNFTs live in a Merkle tree, not a token account. Burning one needs the
 *     Bubblegum program plus a proof from the indexer, and there is no token account to close, so
 *     there is no rent to reclaim either. Not supported here; refusing is honest.
 *   • frozen — a freeze authority blocks both burn and transfer. Some scam mints do this
 *     deliberately. The instruction would fail on-chain, so we never build it.
 *   • not held — the wallet doesn't actually own it (stale snapshot, already sent away).
 */
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createBurnCheckedInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { connection } from "./connection";
import type { Collectible } from "./collectibles";

export type BurnBlocker = "compressed" | "frozen" | "not-held" | "unreadable";

export interface BurnPlan {
  /** null when the item can be burned. */
  blocked: BurnBlocker | null;
  /** Human-readable reason when blocked. */
  reason?: string;
  /** SOL that closing the token account will return. */
  reclaimSol: number;
}

/** Plain-language explanation for each refusal, shown instead of a burn button. */
const REASONS: Record<BurnBlocker, string> = {
  compressed:
    "This is a compressed NFT — it lives in a Merkle tree rather than its own account, so there's no rent locked up and burning it needs a different program. Not supported yet.",
  frozen:
    "This token has been frozen by its issuer, which blocks burning and transferring alike. Nothing can be done with it on-chain.",
  "not-held": "This item isn't in your wallet any more, so there's nothing to burn.",
  unreadable: "Couldn't read this token's account, so it isn't safe to burn right now.",
};

/**
 * Decide whether `item` can be burned, and how much rent comes back. Never throws — a failure to
 * read is itself a refusal, because burning on incomplete information is the one thing we mustn't do.
 */
export async function burnPreflight(item: Collectible, owner: string): Promise<BurnPlan> {
  if (item.compressed) return { blocked: "compressed", reason: REASONS.compressed, reclaimSol: 0 };
  try {
    const mintPk = new PublicKey(item.mint);
    const mintInfo = await connection.getAccountInfo(mintPk);
    if (!mintInfo) return { blocked: "unreadable", reason: REASONS.unreadable, reclaimSol: 0 };
    const programId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const ata = getAssociatedTokenAddressSync(mintPk, new PublicKey(owner), false, programId);

    const parsed = await connection.getParsedAccountInfo(ata);
    const val = parsed.value;
    if (!val) return { blocked: "not-held", reason: REASONS["not-held"], reclaimSol: 0 };

    const info = (val.data as { parsed?: { info?: { state?: string; tokenAmount?: { amount?: string } } } })?.parsed?.info;
    if (!info) return { blocked: "unreadable", reason: REASONS.unreadable, reclaimSol: 0 };
    if (info.state === "frozen") return { blocked: "frozen", reason: REASONS.frozen, reclaimSol: 0 };
    if ((info.tokenAmount?.amount ?? "0") === "0")
      return { blocked: "not-held", reason: REASONS["not-held"], reclaimSol: 0 };

    // The account's own lamports are exactly what closing it returns.
    return { blocked: null, reclaimSol: val.lamports / LAMPORTS_PER_SOL };
  } catch {
    return { blocked: "unreadable", reason: REASONS.unreadable, reclaimSol: 0 };
  }
}

/**
 * Burn the token and close its account in one transaction, returning the signature and the rent
 * recovered. Run `burnPreflight` first — this assumes it passed.
 */
export async function burnCollectible(
  kp: Keypair,
  item: Collectible
): Promise<{ signature: string; reclaimedSol: number }> {
  const mintPk = new PublicKey(item.mint);
  const mintInfo = await connection.getAccountInfo(mintPk);
  if (!mintInfo) throw new Error("Couldn't read this token's mint.");
  const programId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const ata = getAssociatedTokenAddressSync(mintPk, kp.publicKey, false, programId);

  const before = await connection.getAccountInfo(ata);
  if (!before) throw new Error("This item isn't in your wallet any more.");

  const tx = new Transaction().add(
    // burnChecked (rather than burn) makes the node verify the decimals we think this token has —
    // a cheap guard against burning the wrong amount of something that isn't the NFT we expect.
    createBurnCheckedInstruction(ata, mintPk, kp.publicKey, 1n, 0, [], programId),
    // Closing returns the rent-exempt deposit to the owner. Only valid once the balance is zero,
    // which the burn above guarantees within this same transaction.
    createCloseAccountInstruction(ata, kp.publicKey, kp.publicKey, [], programId)
  );

  const signature = await sendAndConfirmTransaction(connection, tx, [kp]);
  return { signature, reclaimedSol: before.lamports / LAMPORTS_PER_SOL };
}
