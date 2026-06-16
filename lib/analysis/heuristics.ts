/**
 * Behavioral heuristics over normalized chain data.
 *
 * Thresholds are named constants so they can be tuned per-token: a sniper window
 * that makes sense for a pump.fun launch differs from a major-cap token. All
 * functions are pure and side-effect free so they are trivial to unit test.
 */
import { isCex, isInfrastructure, getLabel } from "../labels/labels";

/** A wallet first seen within this many days is "fresh". */
export const FRESH_WALLET_DAYS = 7;
/** Holding more than this share of supply (1%) is a "whale". */
export const WHALE_SUPPLY_PCT = 0.01;
/** A first buy within this many minutes of mint creation is a "sniper". */
export const SNIPER_WINDOW_MIN = 5;

export type HeuristicFlag = "fresh" | "whale" | "sniper" | "cex" | "program" | "burn";

export interface HeuristicInput {
  address: string;
  /** Unix seconds of earliest activity. */
  firstSeen?: number;
  /** Share of token supply held, in [0, 1]. */
  holdingPct?: number;
  /** Unix seconds of the address's first acquisition of the token. */
  firstBuyTs?: number;
  /** Unix seconds the mint was created. */
  mintCreatedTs?: number;
  /** Override "now" (unix seconds) for deterministic tests. */
  now?: number;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export function isFresh(firstSeen: number | undefined, now: number = nowSec()): boolean {
  if (!firstSeen) return false;
  return now - firstSeen < FRESH_WALLET_DAYS * 86_400;
}

export function isWhale(holdingPct: number | undefined): boolean {
  return (holdingPct ?? 0) > WHALE_SUPPLY_PCT;
}

export function isSniper(
  firstBuyTs: number | undefined,
  mintCreatedTs: number | undefined
): boolean {
  if (!firstBuyTs || !mintCreatedTs) return false;
  const delta = firstBuyTs - mintCreatedTs;
  return delta >= 0 && delta <= SNIPER_WINDOW_MIN * 60;
}

/** Returns all heuristic flags that apply to an address given its context. */
export function classifyAddress(input: HeuristicInput): HeuristicFlag[] {
  const flags: HeuristicFlag[] = [];
  const now = input.now ?? nowSec();

  // Label-based flags are free (no extra API calls).
  if (isCex(input.address)) flags.push("cex");
  if (getLabel(input.address)?.type === "burn") flags.push("burn");
  if (isInfrastructure(input.address) && getLabel(input.address)?.type !== "burn") {
    flags.push("program");
  }

  // Data-driven flags.
  if (isFresh(input.firstSeen, now)) flags.push("fresh");
  if (isWhale(input.holdingPct)) flags.push("whale");
  if (isSniper(input.firstBuyTs, input.mintCreatedTs)) flags.push("sniper");

  return flags;
}
