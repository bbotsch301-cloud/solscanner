import { Connection, clusterApiUrl } from "@solana/web3.js";

/** Solana cluster the wallet talks to. Devnet = test network, fake money. */
export const CLUSTER = "devnet" as const;

export const connection = new Connection(clusterApiUrl(CLUSTER), "confirmed");

/** Solscan link for the current cluster. */
export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=${CLUSTER}`;
}

export function solscanAccount(address: string): string {
  return `https://solscan.io/account/${address}?cluster=${CLUSTER}`;
}
