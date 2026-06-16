/**
 * Lightweight forensic summaries derived from data the app already fetches — no
 * extra API calls. These are the cheap cousins of the v2 funding-trace/PnL work.
 */
import type { Holder, Transfer } from "../chains/types";

// Concentration risk bands by share held in the top 10 holders.
export const CONCENTRATION_HIGH = 0.6; // top 10 hold > 60% of supply
export const CONCENTRATION_MEDIUM = 0.35; // top 10 hold > 35% of supply

export interface Concentration {
  holderCount: number;
  /** Largest single holder's share of supply, [0, 1]. */
  top1Pct?: number;
  /** Combined share of the top 10 holders, [0, 1]. */
  top10Pct?: number;
  risk: "low" | "medium" | "high";
}

/** Summarizes how concentrated a token's holders are. Expects holders sorted desc. */
export function concentration(holders: Holder[]): Concentration {
  const withPct = holders.filter((h) => h.pct != null);
  const sorted = [...holders].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  const top1Pct = sorted[0]?.pct;
  const top10Pct = withPct.length
    ? sorted.slice(0, 10).reduce((s, h) => s + (h.pct ?? 0), 0)
    : undefined;

  let risk: Concentration["risk"] = "low";
  if (top10Pct != null) {
    if (top10Pct > CONCENTRATION_HIGH) risk = "high";
    else if (top10Pct > CONCENTRATION_MEDIUM) risk = "medium";
  }

  return { holderCount: holders.length, top1Pct, top10Pct, risk };
}

export interface FundingHint {
  /** Address that first sent value to the wallet. */
  source: string;
  timestamp: number;
  mint: string;
  amount: number;
}

/**
 * The earliest inbound transfer to an address — a cheap "who funded this first"
 * signal. (Full multi-hop source-of-funds tracing is the v2 funding-trace.)
 */
export function firstInboundFunding(
  transfers: Transfer[],
  address: string
): FundingHint | undefined {
  const inbound = transfers.filter((t) => t.destination === address);
  if (inbound.length === 0) return undefined;
  const earliest = inbound.reduce((a, b) => (a.timestamp <= b.timestamp ? a : b));
  return {
    source: earliest.source,
    timestamp: earliest.timestamp,
    mint: earliest.mint,
    amount: earliest.amount,
  };
}
