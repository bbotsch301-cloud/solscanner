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
  /** Display name, e.g. "Physical Silver". */
  label: string;
  /** Asset class, e.g. "Silver", "Currency", "Real estate". */
  category: string;
  /** Quantity held (e.g. 10). */
  amount?: number;
  /** Unit for the quantity (e.g. "oz", "IQD"). */
  unit?: string;
  /** Fallback USD value if live pricing is unavailable or not configured. */
  valueUsd: number;
  /**
   * Optional live price source (see prices/offchain.ts):
   *   "silver" → value = amount(oz) × live silver spot
   *   "iqd"    → value = amount(IQD) ÷ live USD→IQD rate
   * When omitted, `valueUsd` is used as-is.
   */
  live?: "silver" | "iqd";
  /** Which built-in SVG coin logo to show (see components/AssetLogo). */
  icon?: "silver" | "dinar";
  /** Optional context, e.g. the rate/date the estimate is based on. */
  note?: string;
}

export const OFFCHAIN_ASSETS: OffchainAsset[] = [
  // Values are priced live where possible; `valueUsd` is the fallback estimate.
  { label: "Physical Silver", category: "Silver", amount: 10, unit: "oz", valueUsd: 310, live: "silver", icon: "silver", note: "live spot" },
  { label: "Iraqi Dinar", category: "Currency", amount: 500000, unit: "IQD", valueUsd: 380, live: "iqd", icon: "dinar", note: "live rate" },
];
