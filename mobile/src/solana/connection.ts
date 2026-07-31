import { Connection, clusterApiUrl } from "@solana/web3.js";

/**
 * Network selection.
 *
 * The app is LIVE on mainnet so the exchange (Swap) works with real tokens.
 * XGO itself isn't on mainnet yet, so XGO/Treasury/Govern screens stay empty
 * ("launching soon") until XGO is deployed and its mint/treasury are set.
 *
 * REAL FUNDS. Use a real RPC below, test with tiny amounts, and move to a
 * standalone signed build before promoting this widely.
 */
type Network = "devnet" | "mainnet-beta";
export const NETWORK = "mainnet-beta" as Network;
export const IS_MAINNET = NETWORK === "mainnet-beta";

// 👉 Paste your Helius mainnet RPC URL here (strongly recommended — the public
//    endpoint below is heavily rate-limited and swaps may fail on it).
const MAINNET_RPC =
  process.env.EXPO_PUBLIC_MAINNET_RPC || "https://api.mainnet-beta.solana.com";

const RPC_URL = IS_MAINNET ? MAINNET_RPC : clusterApiUrl("devnet");

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
