/**
 * Community swap fee policy.
 *
 * XGO's 1.11% transfer fee already taxes the XGO leg of any trade, so XGO swaps are
 * fee-free at the app level (no double-tax). Non-XGO swaps — the majority of volume,
 * which pays the treasury nothing today — carry a 0.44% fee that flows to the
 * treasury (discretionary buyback/burn). Shown transparently in the swap UI.
 *
 * `feeBpsFor` is the single place fees are decided, so a future per-membership-tier
 * discount can hook in here without touching the swap flow.
 */
import { XGO_MINT } from "../solana/token2022";
import { cachedLiquidity, WSOL_MINT } from "../solana/prices";
import { TREASURY_ADDRESS } from "./treasury";

/** Base community fee, in basis points (44 = 0.44%). */
export const SWAP_FEE_BPS = 44;

/** Fee (bps) for a given pair: 0 for any XGO trade, otherwise the base fee. */
export function feeBpsFor(inputMint: string, outputMint: string): number {
  if (inputMint === XGO_MINT || outputMint === XGO_MINT) return 0;
  return SWAP_FEE_BPS;
}

/**
 * WHICH SIDE of the swap the fee is taken from.
 *
 * Jupiter can only skim the OUTPUT (its `feeAccount` must be a token account of the output mint on
 * an ExactIn swap), which is why a SOL → memecoin trade used to pay the treasury in memecoin. The
 * app can take it from the input itself, so the choice is now ours — and the rule is: charge the
 * side with more liquidity. The fee always gets collected; only its denomination changes.
 *
 * That leaves the treasury holding SOL and stablecoins instead of dust it may never be able to
 * sell, and on the input path it needs no treasury token account, so nobody pays the ~0.002 SOL
 * rent to create one.
 *
 * DELIBERATELY SYNCHRONOUS. This runs while quoting, and a network round-trip here would add
 * latency to every swap. The first three rungs need no I/O at all; the fourth reads a cache that
 * `warmLiquidity` fills in behind the previous quote. An unmeasured pair falls through to the
 * output side, which Jupiter collects inline — so "we don't know yet" still collects the fee.
 */
const MAJORS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
]);

export function feeSideFor(inputMint: string, outputMint: string): "input" | "output" {
  // 1. SOL wins outright — the fee is then exact arithmetic on a lamport amount, no price needed.
  if (inputMint === WSOL_MINT) return "input";
  if (outputMint === WSOL_MINT) return "output";

  // 2. A stablecoin beats anything that isn't one. Covers USDC → memecoin with no lookup.
  const inMajor = MAJORS.has(inputMint);
  const outMajor = MAJORS.has(outputMint);
  if (inMajor !== outMajor) return inMajor ? "input" : "output";

  // 3. Both obscure (or both major): whichever pool is deeper, if we've measured them.
  const inLiq = cachedLiquidity(inputMint);
  const outLiq = cachedLiquidity(outputMint);
  if (inLiq != null && outLiq != null) return inLiq > outLiq ? "input" : "output";

  // 4. Never measured. Output side is the safe default: Jupiter charges it inline, so the fee is
  //    collected regardless, and the next quote for this pair will have the measurement.
  return "output";
}

/**
 * Treasury wallet that OWNS the community-fee token accounts (mainnet). The 0.44% is taken in
 * the swap's OUTPUT token and deposited into this wallet's associated token account for that
 * mint. Jupiter (since Jan 2025) needs no referral program — any token account works — but it
 * won't create the account, so the swap flow creates it idempotently on first use.
 *
 * Defaults to the DISPLAYED treasury rather than repeating its address, so the Treasury screen
 * can't advertise one account while fees land in another. EXPO_PUBLIC_SOLANA_FEE_OWNER still
 * overrides it if the two are ever meant to differ — but that now has to be deliberate.
 *
 * Careful with the `||` chain: an empty value here is the global fee kill switch (swap.ts), so
 * this must never resolve to "".
 */
export const TREASURY_FEE_OWNER = process.env.EXPO_PUBLIC_SOLANA_FEE_OWNER || TREASURY_ADDRESS;

/** EVM fee recipient (the treasury's 0x address), used by the EVM-swaps build. */
export const EVM_FEE_RECIPIENT = process.env.EXPO_PUBLIC_EVM_FEE_RECIPIENT ?? "";
