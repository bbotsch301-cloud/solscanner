import { PublicKey } from "@solana/web3.js";
import { connection } from "./connection";

export interface TxSummary {
  signature: string;
  slot: number;
  blockTime: number | null;
  failed: boolean;
}

/** Recent transaction signatures for an address (devnet). */
export async function fetchHistory(
  address: string,
  limit = 25
): Promise<TxSummary[]> {
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey(address),
    { limit }
  );
  return sigs.map((s) => ({
    signature: s.signature,
    slot: s.slot,
    blockTime: s.blockTime ?? null,
    failed: !!s.err,
  }));
}
