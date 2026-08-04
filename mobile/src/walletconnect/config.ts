/**
 * WalletConnect config.
 *
 * The project id is compiled in rather than read from an environment variable, and that is
 * deliberate: it identifies *this app* to Reown's relay, not the member using it. One id serves
 * every member forever. Asking each person to obtain and paste one would be asking them to do the
 * app's job, and leaving it unset — which is how this shipped — meant dApp connect was inert for
 * everyone and the screen explained itself by naming an environment variable, which no member can
 * act on.
 *
 * It is not a credential. It is inside every published bundle and anyone holding the .apk or .ipa
 * can read it, so committing it changes how easily it is *found*, not whether it can be found. The
 * real exposure is relay quota, and the mitigations are Reown's dashboard allowlist and rotating
 * the id — not secrecy.
 *
 * The environment variable remains as an override, which is what makes this a default rather than a
 * hard-coding: a fork, a second deployment, or a rotation can point elsewhere without a code change.
 *
 * The Goshen web app MUST use this same id. A mismatch pairs and then silently fails to relay,
 * which looks like the wallet ignoring the site.
 */
const DEFAULT_PROJECT_ID = "d45584cd10d4697e23184ab80044a739";

export const WC_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID || DEFAULT_PROJECT_ID;

/**
 * Now true for every build, since the default is never empty.
 *
 * Kept rather than deleted because every call site already branches on it and the branches are the
 * honest thing to keep: `||` was chosen over `??` deliberately, so that a blank
 * `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID=` in a hand-made `.env` — the single most likely way to
 * misconfigure this, since that is exactly what `.env.example` shows — falls back to the default
 * instead of silently switching dApp connect off.
 */
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
