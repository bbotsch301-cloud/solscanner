/**
 * Disk-backed snapshots for the screens that used to keep their last-good data in a module-level
 * Map. Those survived navigation but NOT an app restart, so every cold open started from nothing —
 * which is why the treasury sat at "$0.00" for a beat and the activity list opened blank.
 *
 * Declared here rather than inside the screens so startup can preload them without importing the
 * screen modules, and so every max-age decision is in one place. All imports are type-only, so this
 * file pulls in no runtime dependencies beyond the cache factory itself.
 */
import { createDiskSnapshot } from "./diskSnapshot";
import { preloadFeaturedTokens } from "../swap/featuredTokens";
import { preloadLiquidityCache } from "../solana/prices";
import type { Holdings } from "../solana/treasury";
import type { PriceInfo } from "../solana/prices";
import type { Deposit } from "../solana/deposits";
import type { TransferFee } from "../solana/token2022";
import type { OffchainPrices } from "../prices/offchain";
import type { HistoryItem } from "../activity";
import type { Candle } from "../prices/candles";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the Ecosystem (treasury) screen needs to paint a full page with no network at all.
 *  Token names/logos are deliberately absent — solana/tokens.ts already persists those per mint,
 *  and duplicating them here would just let the two copies disagree. */
export interface EcoSnapshot {
  holdings: Holdings;
  prices: Record<string, PriceInfo>;
  ocPrices: OffchainPrices;
  deposits: Deposit[];
  /**
   * Whether `deposits` came from a scan that actually SUCCEEDED.
   *
   * An empty array is written on failure too (to preserve whatever was there before), so on its
   * own it can't be told apart from a treasury that genuinely has no inflows — and a snapshot
   * written during an outage would make the next cold open declare "No deposits yet" instantly,
   * with total confidence, before it had looked. Same unknown-vs-zero trap as the USD totals, one
   * level down. Absent on snapshots written before this field existed, which correctly reads as
   * "not authoritative" and shows the skeleton until this session's scan answers.
   */
  depositsLoaded?: boolean;
  supply: number | null;
  fee: TransferFee | null;
}

/** Keyed by treasury address. A week matches the wallet snapshot's horizon: long enough to cover
 *  a lapsed user, short enough that what we paint is still recognisable. */
export const ecoSnapshots = createDiskSnapshot<EcoSnapshot>("eco.snap.v1:", 7 * DAY_MS);

/** Keyed by `${chainId}:${address}`. Confirmed transactions don't change, so an old list is only
 *  ever incomplete, never wrong — hence the generous horizon. */
export const activitySnapshots = createDiskSnapshot<HistoryItem[]>("act.snap.v1:", 7 * DAY_MS);

/** Keyed by `${chainId}:${assetKey}:${range}`. Short horizon: candles go stale fast, and a chart
 *  from last week drawn as if current would misinform. A day still covers "open the app again
 *  tomorrow" with an instant chart that then corrects itself. */
export const candleSnapshots = createDiskSnapshot<Candle[]>("candle.v1:", DAY_MS);

/** Warm every screen cache. Called once from App's startup preload, alongside the token-metadata
 *  and wallet-balance preloads. */
export function preloadScreenCaches(): Promise<unknown> {
  return Promise.all([
    ecoSnapshots.preload(),
    activitySnapshots.preload(),
    candleSnapshots.preload(),
    // Lives in swap/ because it owns its own resolution, but it's the same idea and belongs in the
    // same startup pass — the swap picker should open with its featured list already there.
    preloadFeaturedTokens(),
    // Which side of a swap the community fee comes out of is decided synchronously at quote time
    // from this cache, so it has to be warm before the first swap.
    preloadLiquidityCache(),
  ]);
}
