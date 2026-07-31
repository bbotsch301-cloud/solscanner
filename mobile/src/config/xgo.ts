/**
 * Display config for stats that aren't live-derivable on devnet.
 *
 * On devnet XGO has no market price and there's no holder indexer, so these are
 * shown from config. On mainnet they become live (price via Jupiter, holders via
 * an indexer). Supply and treasury value are ALWAYS live on-chain.
 */
export const XGO_STATS = {
  /** USD price shown for XGO (live via Jupiter once listed on mainnet). */
  priceUsd: 0.0126,
  /** 24h price change %, for the price tile. */
  priceChange24h: 4.52,
  /** Holder count (live via an indexer on mainnet). */
  holders: 12842,
  /** Original/max supply, used to compute % burned vs the live on-chain supply. */
  maxSupply: 10_000_000_000,
};
