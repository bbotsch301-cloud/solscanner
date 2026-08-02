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

/** Jupiter's price endpoint caps the id list, so long wallets are asked for in batches. */
const JUP_BATCH = 50;

async function fetchJupiterPrices(ids: string[]): Promise<{ prices: Record<string, PriceInfo>; ok: boolean }> {
  const out: Record<string, PriceInfo> = {};
  let ok = false;
  for (let i = 0; i < ids.length; i += JUP_BATCH) {
    const batch = ids.slice(i, i + JUP_BATCH);
    try {
      const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${batch.join(",")}`);
      if (!res.ok) continue;
      const json = (await res.json()) as Record<
        string,
        { usdPrice?: number; priceChange24h?: number } | null
      >;
      ok = true;
      for (const [mint, v] of Object.entries(json)) {
        if (v && typeof v.usdPrice === "number") {
          out[mint] = { usdPrice: v.usdPrice, priceChange24h: v.priceChange24h };
        }
      }
    } catch {
      /* try the next batch; a partial answer still beats none */
    }
  }
  return { prices: out, ok };
}

// --- DexScreener fallback ---------------------------------------------------
//
// Jupiter's price API only covers tokens it has decided to index, so a perfectly tradeable
// small-cap comes back with no price at all — which is why some rows showed an amount and a
// dash where a dollar value belonged. DexScreener prices anything with a live pool, and it's
// already a trusted host here (solana/tokens.ts uses it for logos).
const DEX_TOKENS_URL = "https://api.dexscreener.com/latest/dex/tokens/";
/** DexScreener accepts a comma-separated list; 30 is its documented ceiling. */
const DEX_BATCH = 30;
/**
 * Below this much pooled liquidity, a quoted spot price isn't a price anyone could actually
 * get. Multiplying it by a multi-billion token balance would print a confident, badly wrong
 * dollar figure — worse than the dash it replaced. Under the floor we keep saying "unknown".
 */
const MIN_LIQUIDITY_USD = 1000;

interface DexPair {
  chainId?: string;
  priceUsd?: string;
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
}

/**
 * Prices for mints another source couldn't cover. Exported so the Helius fast-balances path —
 * which brings its own prices and never calls `fetchPrices` — can fill the same gaps.
 * Never throws; an empty result just means nothing extra was found.
 */
export async function fetchDexPrices(mints: string[]): Promise<Record<string, PriceInfo>> {
  const out: Record<string, PriceInfo> = {};
  // Base58 is case-sensitive and DexScreener echoes its own casing, so map back to the exact
  // string the caller asked for — the returned record's keys have to match the mints given.
  const byLower = new Map(mints.map((m) => [m.toLowerCase(), m]));

  for (let i = 0; i < mints.length; i += DEX_BATCH) {
    const batch = mints.slice(i, i + DEX_BATCH);
    try {
      const res = await fetch(DEX_TOKENS_URL + batch.join(","));
      if (!res.ok) continue;
      const { pairs } = (await res.json()) as { pairs?: DexPair[] | null };

      // A token can have many pools, some of them dust with nonsense prices. Take the deepest.
      const deepest = new Map<string, DexPair>();
      for (const p of pairs ?? []) {
        if (p.chainId && p.chainId !== "solana") continue;
        const mint = byLower.get((p.baseToken?.address ?? "").toLowerCase());
        if (!mint) continue; // a quote-side token, not one we asked about
        const prev = deepest.get(mint);
        if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) deepest.set(mint, p);
      }

      for (const [mint, p] of deepest) {
        const usdPrice = Number(p.priceUsd);
        if (!Number.isFinite(usdPrice) || usdPrice <= 0) continue;
        if ((p.liquidity?.usd ?? 0) < MIN_LIQUIDITY_USD) continue;
        out[mint] = { usdPrice, priceChange24h: p.priceChange?.h24 };
      }
    } catch {
      /* best-effort: these are the tokens Jupiter already couldn't price */
    }
  }
  // Persist here as well as in fetchPrices, since the fast-balances path calls this directly.
  // Writing twice on the combined path is harmless — the later write just re-stamps.
  persistPrices(out);
  return out;
}

export async function fetchPrices(
  mints: string[]
): Promise<Record<string, PriceInfo>> {
  const ids = [...new Set(mints)].filter(Boolean);
  if (ids.length === 0) return {};

  const { prices, ok } = await fetchJupiterPrices(ids);
  // Every batch failed — that's an outage, and callers rely on the throw to keep showing their
  // last-known prices rather than publishing an empty map over good values.
  if (!ok) throw new Error("Price API unavailable");

  // Second pass for whatever Jupiter didn't cover.
  const missing = ids.filter((m) => !prices[m]);
  const out = missing.length ? { ...prices, ...(await fetchDexPrices(missing)) } : prices;

  persistPrices(out);
  return out;
}
