/**
 * WalletConnect config. Needs a free project id from cloud.reown.com. Without it the
 * whole dApp-connect feature stays hidden (wcEnabled === false).
 */
export const WC_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";
export const wcEnabled = WC_PROJECT_ID.length > 0;

export const WC_METADATA = {
  name: "XGO Wallet",
  description: "XGO — self-custody multi-chain wallet",
  url: "https://globalgoshens.org",
  icons: ["https://globalgoshens.org/icon.png"],
  redirect: { native: "xgowallet://", universal: "" },
};

/**
 * CAIP-2 chain ids for Solana, per cluster.
 *
 * The first 32 characters of each cluster's genesis hash, which is how CAIP-2 names a Solana network.
 *
 * All three are advertised, not just the one the wallet is currently pointed at. Signing is
 * network-agnostic — a signature over a message is valid wherever it lands — so refusing to *pair*
 * with a devnet dApp because the wallet happens to be on mainnet would be refusing something
 * harmless. Only broadcasting cares which network it is, and `handleSolanaRequest` guards that
 * separately.
 *
 * This used to be a single mainnet constant, which meant the Goshen web app — devnet-first — could
 * not pair at all. The failure surfaced as a generic "couldn't connect", because namespace approval
 * throws before anything reaches a screen that could explain it.
 */
export const SOLANA_CAIP2_BY_CLUSTER = {
  "mainnet-beta": "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  devnet: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  testnet: "solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z",
} as const;

export const SOLANA_CAIP2_ALL = Object.values(SOLANA_CAIP2_BY_CLUSTER);

/** Mainnet, kept under its old name so nothing that imported it breaks. */
export const SOLANA_CAIP2 = SOLANA_CAIP2_BY_CLUSTER["mainnet-beta"];
