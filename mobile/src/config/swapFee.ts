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
import { TREASURY_ADDRESS } from "./treasury";

/** Base community fee, in basis points (44 = 0.44%). */
export const SWAP_FEE_BPS = 44;

/** Fee (bps) for a given pair: 0 for any XGO trade, otherwise the base fee. */
export function feeBpsFor(inputMint: string, outputMint: string): number {
  if (inputMint === XGO_MINT || outputMint === XGO_MINT) return 0;
  return SWAP_FEE_BPS;
}

/**
 * Treasury wallet that OWNS the community-fee token accounts (mainnet). The 0.44% is taken in
 * the swap's OUTPUT token and deposited into this wallet's associated token account for that
 * mint. Jupiter (since Jan 2025) needs no referral program — any token account works — but it
 * won't create the account, so the swap flow creates it idempotently on first use.
 *
 * Defaults to the DISPLAYED treasury rather than repeating its address, so the Ecosystem screen
 * can't advertise one account while fees land in another. EXPO_PUBLIC_SOLANA_FEE_OWNER still
 * overrides it if the two are ever meant to differ — but that now has to be deliberate.
 *
 * Careful with the `||` chain: an empty value here is the global fee kill switch (swap.ts), so
 * this must never resolve to "".
 */
export const TREASURY_FEE_OWNER = process.env.EXPO_PUBLIC_SOLANA_FEE_OWNER || TREASURY_ADDRESS;

/** EVM fee recipient (the treasury's 0x address), used by the EVM-swaps build. */
export const EVM_FEE_RECIPIENT = process.env.EXPO_PUBLIC_EVM_FEE_RECIPIENT ?? "";
