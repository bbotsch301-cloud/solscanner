import { Connection, clusterApiUrl } from "@solana/web3.js";

/**
 * Network selection. Flip NETWORK to "mainnet-beta" to go LIVE with REAL FUNDS.
 *
 * Before flipping to mainnet, make sure:
 *  - EXPO_PUBLIC_MAINNET_RPC is set to a real RPC (e.g. Helius) — the public
 *    endpoint is rate-limited and will feel broken.
 *  - XGO_MINT / TREASURY_ADDRESS point at the MAINNET mint + treasury (the devnet
 *    ones don't exist on mainnet).
 *  - You're running a standalone signed build, NOT Expo Go, and the app has been
 *    security-reviewed. Real money — start with tiny amounts.
 */
type Network = "devnet" | "mainnet-beta";
export const NETWORK = "devnet" as Network;
export const IS_MAINNET = NETWORK === "mainnet-beta";

/** RPC endpoint. Mainnet uses EXPO_PUBLIC_MAINNET_RPC if provided. */
const RPC_URL = IS_MAINNET
  ? process.env.EXPO_PUBLIC_MAINNET_RPC || clusterApiUrl("mainnet-beta")
  : clusterApiUrl("devnet");

export const CLUSTER = NETWORK;
export const connection = new Connection(RPC_URL, "confirmed");

const clusterParam = IS_MAINNET ? "" : "?cluster=devnet";

/** Solscan link for the current cluster. */
export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}${clusterParam}`;
}

export function solscanAccount(address: string): string {
  return `https://solscan.io/account/${address}${clusterParam}`;
}
