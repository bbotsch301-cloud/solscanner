/**
 * Shared config for the community liquidity feature. Safe to import from client or
 * server — no SDK / secret material here. The heavy Raydium SDK lives in
 * `raydium.server.ts`, imported only from API routes.
 *
 * The XGO/SOL treasury pool doesn't exist until XGO launches on mainnet, so
 * NEXT_PUBLIC_XGO_POOL_ID is empty until then and the UI shows a launch-gated
 * state. Set it (to the poolId that `tools/liquidity` create-pool prints) at launch.
 */
export const XGO_MINT = "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** The treasury's XGO/SOL CPMM pool id. Empty until launch. */
export const XGO_POOL_ID = process.env.NEXT_PUBLIC_XGO_POOL_ID ?? "";

export function isPoolConfigured(): boolean {
  return XGO_POOL_ID.trim().length > 0;
}

/** RPC the browser uses to submit signed transactions. */
export const PUBLIC_RPC =
  process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com";

export interface PoolSnapshot {
  configured: boolean;
  poolId: string | null;
  /** SOL per 1 XGO, derived from reserves. */
  priceSolPerXgo: number | null;
  reserves: { xgo: number; sol: number } | null;
  tvlUsd: number | null;
  volume24hUsd: number | null;
  fees24hUsd: number | null;
  /** Present only when a connected owner was passed and holds LP. */
  position: {
    sharePct: number;
    xgo: number;
    sol: number;
  } | null;
}
