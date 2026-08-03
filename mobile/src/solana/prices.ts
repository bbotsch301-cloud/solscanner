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
import { createDiskSnapshot } from "../cache/diskSnapshot";

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
export const MIN_LIQUIDITY_USD = 1000;

interface DexPair {
  chainId?: string;
  priceUsd?: string;
  baseToken?: { address?: string };
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
  info?: { imageUrl?: string };
}

/** The deepest pool DexScreener knows about for a mint: its price, depth and artwork. */
export interface DexInfo {
  usdPrice: number;
  liquidityUsd: number;
  priceChange24h?: number;
  /** Token artwork from the pool listing — often the only logo source for a small-cap. */
  imageUrl?: string;
}

/**
 * One DexScreener round-trip, reduced to the deepest pool per requested token. Shared by the price
 * fallback, the liquidity signal and EVM logo lookup, so they all agree on which pool is
 * authoritative.
 *
 * `chain` is DexScreener's own chain slug, which happens to match our ChainId for the chains we
 * support ("solana", "ethereum", "bsc").
 */
export async function fetchDexInfo(
  mints: string[],
  chain: "solana" | "ethereum" | "bsc" = "solana"
): Promise<Record<string, DexInfo>> {
  const out: Record<string, DexInfo> = {};
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
        if (p.chainId && p.chainId !== chain) continue;
        const mint = byLower.get((p.baseToken?.address ?? "").toLowerCase());
        if (!mint) continue; // a quote-side token, not one we asked about
        const prev = deepest.get(mint);
        if (!prev || (p.liquidity?.usd ?? 0) > (prev.liquidity?.usd ?? 0)) deepest.set(mint, p);
      }

      for (const [mint, p] of deepest) {
        const usdPrice = Number(p.priceUsd);
        out[mint] = {
          usdPrice: Number.isFinite(usdPrice) && usdPrice > 0 ? usdPrice : 0,
          liquidityUsd: p.liquidity?.usd ?? 0,
          priceChange24h: p.priceChange?.h24,
          imageUrl: p.info?.imageUrl,
        };
      }
    } catch {
      /* best-effort: these are the tokens Jupiter already couldn't price */
    }
  }
  return out;
}

// --- Liquidity, for deciding which side of a swap the community fee comes out of ---------------
//
// Read SYNCHRONOUSLY at quote time, so it can't add latency to a swap. A mint we've never measured
// simply has no answer, and the fee policy falls back to a safe default — then `warmLiquidity`
// fills it in behind the quote so the next swap of that pair decides correctly.
const liquidityCache = createDiskSnapshot<number>("liq.v1:", 24 * 60 * 60 * 1000);

/** Warm the liquidity cache at startup (registered in cache/screens.ts). */
export function preloadLiquidityCache(): Promise<void> {
  return liquidityCache.preload();
}

/** Last-measured pooled USD liquidity for a mint, or undefined if we've never looked. */
export function cachedLiquidity(mint: string): number | undefined {
  return liquidityCache.get(mint);
}

/**
 * Why a holding has no dollar value — so the UI can say something useful instead of a bare dash.
 *
 * "illiquid" is a real finding, not a gap: we DID look, found the deepest pool, and it holds less
 * than the floor. That's worth telling a holder plainly, because it means the position can't be
 * sold at any quoted price either. "unknown" means we genuinely haven't managed to look yet.
 */
export function priceUnavailableReason(mint: string): "unknown" | "illiquid" {
  const liq = cachedLiquidity(mint);
  return liq != null && liq < MIN_LIQUIDITY_USD ? "illiquid" : "unknown";
}

/** Measure and persist liquidity for these mints. Fire-and-forget; never throws. */
export async function warmLiquidity(mints: string[]): Promise<void> {
  const need = [...new Set(mints)].filter((m) => m && cachedLiquidity(m) == null);
  if (!need.length) return;
  try {
    const info = await fetchDexInfo(need);
    for (const [mint, i] of Object.entries(info)) liquidityCache.set(mint, i.liquidityUsd);
  } catch {
    /* the fee policy has a fallback; a missed measurement is not an error */
  }
}

// --- GeckoTerminal fallback -------------------------------------------------
//
// The third and last tier, and the reason it exists: the token-detail chart could price tokens the
// Wallet list could not. The chart reaches GeckoTerminal (and pump.fun) — see prices/candles.ts —
// while this module only ever asked Jupiter and DexScreener's /tokens/ endpoint. So a token with a
// real, liquid pool that those two happen not to index showed a dollar value on one screen and a
// dash on the other. Same holding, same second, two answers.
//
// GeckoTerminal indexes pools directly, including the pump/pumpswap pairs DexScreener's token
// lookup sometimes misses (candles.ts already works around exactly that), so it closes the gap
// rather than duplicating a source we've already asked.
const GT_BASE = "https://api.geckoterminal.com/api/v2";
/** GeckoTerminal's network slugs — its own, and not the same as DexScreener's. */
const GT_NET: Record<"solana" | "ethereum" | "bsc", string> = { solana: "solana", ethereum: "eth", bsc: "bsc" };
/** `tokens/multi` takes a comma-separated list; 30 is its documented ceiling. */
const GT_BATCH = 30;

interface GtToken {
  attributes?: { address?: string; price_usd?: string | number; total_reserve_in_usd?: string | number };
}

const posNum = (x: unknown): number | null => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Batch spot price + pooled reserve from GeckoTerminal. Best-effort: a miss returns nothing for
 * that mint, and a failed request returns nothing at all. Never throws.
 *
 * Note this returns the token's reserve across ALL its pools, where `fetchDexInfo` returns the
 * deepest single pool. They're close enough to compare against the same floor, and where they
 * disagree GeckoTerminal's is the larger, better-informed number.
 */
async function fetchGeckoTerminalInfo(
  mints: string[],
  chain: "solana" | "ethereum" | "bsc"
): Promise<Record<string, { usdPrice: number; liquidityUsd: number }>> {
  const out: Record<string, { usdPrice: number; liquidityUsd: number }> = {};
  const byLower = new Map(mints.map((m) => [m.toLowerCase(), m]));

  for (let i = 0; i < mints.length; i += GT_BATCH) {
    const batch = mints.slice(i, i + GT_BATCH);
    try {
      const res = await fetch(`${GT_BASE}/networks/${GT_NET[chain]}/tokens/multi/${batch.join(",")}`);
      if (!res.ok) continue;
      const { data } = (await res.json()) as { data?: GtToken[] | null };
      for (const t of data ?? []) {
        // Echoed addresses are lower-cased, and base58 is case-sensitive — map back to the exact
        // string the caller asked for, or the returned keys won't match any mint we hold.
        const mint = byLower.get((t.attributes?.address ?? "").toLowerCase());
        if (!mint) continue;
        const usdPrice = posNum(t.attributes?.price_usd);
        if (usdPrice == null) continue;
        out[mint] = { usdPrice, liquidityUsd: Number(t.attributes?.total_reserve_in_usd ?? 0) || 0 };
      }
    } catch {
      /* best-effort: these are mints two other sources already failed to price */
    }
  }
  return out;
}

/**
 * Prices for mints another source couldn't cover. Exported so the Helius fast-balances path —
 * which brings its own prices and never calls `fetchPrices` — can fill the same gaps.
 * Never throws; an empty result just means nothing extra was found.
 */
export async function fetchDexPrices(
  mints: string[],
  chain: "solana" | "ethereum" | "bsc" = "solana"
): Promise<Record<string, PriceInfo>> {
  const out: Record<string, PriceInfo> = {};
  const info = await fetchDexInfo(mints, chain);
  for (const [mint, i] of Object.entries(info)) {
    // Record liquidity while we have it — this call and the fee policy want the same number.
    liquidityCache.set(mint, i.liquidityUsd);
    if (i.usdPrice <= 0) continue;
    if (i.liquidityUsd < MIN_LIQUIDITY_USD) continue;
    out[mint] = { usdPrice: i.usdPrice, priceChange24h: i.priceChange24h };
  }

  // Anything still unpriced — no pool found, or a pool too thin to quote from — gets one more
  // look. A thin DexScreener reading is worth re-testing rather than trusting: when the two
  // disagree it's usually because DexScreener indexed a dust pool and missed the real one.
  const stillMissing = mints.filter((m) => !out[m]);
  if (stillMissing.length) {
    const gt = await fetchGeckoTerminalInfo(stillMissing, chain);
    for (const [mint, g] of Object.entries(gt)) {
      // Keep the better-informed depth either way, so the fee policy and the "why is there no
      // price" labels reason from the best measurement we have rather than the most recent one.
      liquidityCache.set(mint, Math.max(g.liquidityUsd, cachedLiquidity(mint) ?? 0));
      // The floor still applies. A price out of a near-empty pool is one nobody could realise,
      // and printing it against a multi-billion token balance is worse than saying nothing.
      if (g.liquidityUsd < MIN_LIQUIDITY_USD) continue;
      out[mint] = { usdPrice: g.usdPrice };
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
