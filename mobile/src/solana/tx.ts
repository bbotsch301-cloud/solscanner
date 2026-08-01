/**
 * Send + confirm a Solana transaction with a DOUBLE-SEND GUARD. `sendAndConfirmTransaction`
 * sends and confirms atomically, so on a confirmation timeout the caller never learns the
 * signature — a retry then rebroadcasts the same transfer (Solana has no nonce) → double-send.
 * These helpers capture the signature, and on a confirm timeout POLL the signature status: if it
 * actually landed we return success (so the UI doesn't prompt a retry); only a genuinely-unlanded
 * tx throws (retry is then legitimate).
 */
import {
  Keypair,
  Transaction,
  type BlockhashWithExpiryBlockHeight,
  type TransactionSignature,
} from "@solana/web3.js";
import { connection } from "./connection";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** After a confirm timeout, poll for a terminal on-chain status before declaring failure. */
async function outcome(sig: TransactionSignature): Promise<"landed" | "failed" | "unknown"> {
  for (let i = 0; i < 6; i++) {
    try {
      const st = (await connection.getSignatureStatuses([sig])).value[0];
      if (st) {
        if (st.err) return "failed";
        if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized" || st.confirmationStatus === "processed")
          return "landed";
      }
    } catch {
      /* keep polling */
    }
    await sleep(1500);
  }
  return "unknown";
}

/** Confirm an already-sent signature; on timeout, recover via status poll. */
export async function confirmWithRecovery(
  sig: TransactionSignature,
  strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
): Promise<void> {
  try {
    await connection.confirmTransaction(strategy, "confirmed");
  } catch (e) {
    const o = await outcome(sig);
    if (o === "landed") return;
    if (o === "failed") throw new Error("The transaction failed on-chain.");
    throw e; // genuinely not confirmed — safe for the caller to retry
  }
}

/**
 * Drop-in replacement for `sendAndConfirmTransaction` for a legacy Transaction: fetch a fresh
 * blockhash, set the fee payer, sign, broadcast (capturing the signature), and confirm with the
 * double-send guard. `signers[0]` is the fee payer.
 */
export async function sendAndConfirmGuarded(tx: Transaction, signers: Keypair[]): Promise<string> {
  const bh: BlockhashWithExpiryBlockHeight = await connection.getLatestBlockhash();
  tx.recentBlockhash = bh.blockhash;
  tx.lastValidBlockHeight = bh.lastValidBlockHeight;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await confirmWithRecovery(sig, { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight });
  return sig;
}
