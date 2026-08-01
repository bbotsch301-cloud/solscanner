/**
 * Off-chain treasury assets — real-world holdings that aren't on the blockchain
 * (gold, fiat reserves, real estate, …). These are MANUALLY stated, so the app shows
 * them clearly separated from the on-chain crypto (which anyone can verify on Solscan).
 *
 * `amount`/`unit` are the actual quantity held (shown as-is). `valueUsd` is a USD
 * estimate used ONLY for the allocation %/total — keep it updated to current prices;
 * it is a manual snapshot, not a live feed.
 */
export interface OffchainAsset {
  /** Display name, e.g. "Physical Gold". */
  label: string;
  /** Asset class, e.g. "Gold", "Currency", "Real estate". */
  category: string;
  /** Quantity held (e.g. 10). */
  amount?: number;
  /** Unit for the quantity (e.g. "oz", "IQD"). */
  unit?: string;
  /** Stated USD value — a manual estimate; update to current prices. */
  valueUsd: number;
  /** Optional context, e.g. the rate/date the estimate is based on. */
  note?: string;
}

export const OFFCHAIN_ASSETS: OffchainAsset[] = [
  // USD figures are manual estimates — update them as prices move.
  { label: "Physical Gold", category: "Gold", amount: 10, unit: "oz", valueUsd: 27000, note: "≈ $2,700/oz" },
  { label: "Iraqi Dinar", category: "Currency", amount: 500000, unit: "IQD", valueUsd: 380, note: "≈ 1,320 IQD/USD" },
];
