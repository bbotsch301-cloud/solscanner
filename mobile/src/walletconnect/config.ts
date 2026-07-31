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

/** CAIP-2 chain id for Solana mainnet (WalletConnect). */
export const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
