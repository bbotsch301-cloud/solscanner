/**
 * Chain-agnostic transaction activity. Solana uses signatures (via solana/history);
 * EVM uses the Etherscan V2 API (via evm/history). Both normalize to HistoryItem so
 * the Home + Activity screens render one shape.
 */
import type { ChainDef } from "./chains/registry";
import { fetchHistory } from "./solana/history";
import { solscanTx } from "./solana/connection";
import { fetchEvmHistory } from "./evm/history";

export interface HistoryItem {
  id: string; // signature or tx hash
  time: number | null; // unix seconds
  failed: boolean;
  direction: "in" | "out" | null; // EVM only; null for Solana
  valueLabel: string | null; // e.g. "0.5 ETH"; null when unknown
  explorerUrl: string;
}

export async function fetchActivity(
  chain: ChainDef,
  address: string | null,
  limit = 25
): Promise<HistoryItem[]> {
  if (!address) return [];
  if (chain.kind === "solana") {
    const sigs = await fetchHistory(address, limit);
    return sigs.map((s) => ({
      id: s.signature,
      time: s.blockTime,
      failed: s.failed,
      direction: null,
      valueLabel: null,
      explorerUrl: solscanTx(s.signature),
    }));
  }
  return fetchEvmHistory(chain, address, limit);
}
