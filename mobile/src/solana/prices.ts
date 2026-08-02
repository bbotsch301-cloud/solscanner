/**
 * Live USD prices from Jupiter's public Price API v3 (no key required).
 * Keyed by mint; native SOL is priced via the wrapped-SOL mint.
 * Note: devnet SPL test tokens generally won't have a market price.
 *
 * Prices are also cached to disk (one entry per mint, same idiom as solana/tokens.ts) so a cold
 * open can PAINT last-known USD values on the first frame instead of "$0.00". A cached price is
 * for DISPLAY ONLY — never quote or swap against it; those paths always call `fetchPrices`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface PriceInfo {
  usdPrice: number;
  /** 24h change as a percentage, e.g. 1.29 = +1.29%. */
  priceChange24h?: number;
}

// Persistent price cache. Bump the version to invalidate every stored entry.
const PRICE_KEY = "price.v1:";
/** Older than this and we'd rather show a skeleton than a number that's drifted. An hour is short
 *  enough that a seeded value is close, and long enough to cover a normal day's app usage. */
const PRICE_MAX_AGE_MS = 60 * 60 * 1000;

interface StoredPrice {
  ts: number;
  p: PriceInfo;
}

/** Warm snapshot of the on-disk prices, loaded once at startup for synchronous first-render use. */
const warm = new Map<string, StoredPrice>();

/** Load persisted prices into memory (call once at startup, before rendering). */
export async function preloadPriceCache(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PRICE_KEY));
    if (!keys.length) return;
    for (const [k, raw] of await AsyncStorage.multiGet(keys)) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as StoredPrice;
        if (parsed && typeof parsed.ts === "number" && typeof parsed.p?.usdPrice === "number") {
          warm.set(k.slice(PRICE_KEY.length), parsed);
        }
      } catch {
        /* skip a corrupt entry */
      }
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Synchronously read recently-known prices for the given mints — used to seed a screen so USD
 * values render on the first frame. Stale entries are omitted, so a caller can still tell the
 * difference between "unpriced" and "worth zero".
 */
export function cachedPrices(mints: string[]): Record<string, PriceInfo> {
  const out: Record<string, PriceInfo> = {};
  const now = Date.now();
  for (const m of mints) {
    const hit = warm.get(m);
    if (hit && now - hit.ts <= PRICE_MAX_AGE_MS) out[m] = hit.p;
  }
  return out;
}

function persistPrices(prices: Record<string, PriceInfo>): void {
  const entries = Object.entries(prices);
  if (!entries.length) return;
  const ts = Date.now();
  const pairs: [string, string][] = [];
  for (const [mint, p] of entries) {
    const stored: StoredPrice = { ts, p };
    warm.set(mint, stored);
    pairs.push([PRICE_KEY + mint, JSON.stringify(stored)]);
  }
  AsyncStorage.multiSet(pairs).catch(() => {});
}

export async function fetchPrices(
  mints: string[]
): Promise<Record<string, PriceInfo>> {
  const ids = [...new Set(mints)].filter(Boolean);
  if (ids.length === 0) return {};

  const res = await fetch(
    `https://lite-api.jup.ag/price/v3?ids=${ids.join(",")}`
  );
  if (!res.ok) throw new Error(`Price API ${res.status}`);
  const json = (await res.json()) as Record<
    string,
    { usdPrice?: number; priceChange24h?: number } | null
  >;

  const out: Record<string, PriceInfo> = {};
  for (const [mint, v] of Object.entries(json)) {
    if (v && typeof v.usdPrice === "number") {
      out[mint] = { usdPrice: v.usdPrice, priceChange24h: v.priceChange24h };
    }
  }
  persistPrices(out);
  return out;
}
