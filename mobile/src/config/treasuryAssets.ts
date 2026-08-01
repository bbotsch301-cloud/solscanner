/**
 * Off-chain treasury assets — real-world holdings that aren't on the blockchain
 * (gold, fiat reserves, real estate, …). These are MANUALLY stated, so the app shows
 * them clearly separated from the on-chain crypto (which anyone can verify on Solscan).
 *
 * Add entries here as the treasury diversifies; each one appears in the allocation
 * donut and the holdings list. Value is a USD figure you maintain.
 */
export interface OffchainAsset {
  /** Display name, e.g. "Physical Gold". */
  label: string;
  /** Asset class, e.g. "Gold", "Currency", "Real estate". */
  category: string;
  /** Stated value in USD. */
  valueUsd: number;
}

export const OFFCHAIN_ASSETS: OffchainAsset[] = [
  // Examples — uncomment / edit with real figures:
  // { label: "Physical Gold", category: "Gold", valueUsd: 25000 },
  // { label: "USD Reserve", category: "Currency", valueUsd: 10000 },
];
