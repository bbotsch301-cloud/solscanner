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

/** Base community fee, in basis points (44 = 0.44%). */
export const SWAP_FEE_BPS = 44;

/** Fee (bps) for a given pair: 0 for any XGO trade, otherwise the base fee. */
export function feeBpsFor(inputMint: string, outputMint: string): number {
  if (inputMint === XGO_MINT || outputMint === XGO_MINT) return 0;
  return SWAP_FEE_BPS;
}

/**
 * Treasury fee destinations (mainnet, treasury-owned). Empty until set up:
 * - Solana: a Jupiter referral fee-token account (referral.jup.ag). Without it the
 *   fee is simply not applied — swaps still work, just uncollected.
 * - EVM: the treasury's 0x address (used by the EVM-swaps build).
 */
export const SOLANA_FEE_ACCOUNT = process.env.EXPO_PUBLIC_SOLANA_FEE_ACCOUNT ?? "";
export const EVM_FEE_RECIPIENT = process.env.EXPO_PUBLIC_EVM_FEE_RECIPIENT ?? "";
