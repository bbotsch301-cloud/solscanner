/**
 * DexScreener market data — one keyless API that resolves both Solana and EVM tokens
 * by address (price, 24h change, market cap, logo, chain). Best-effort; fails soft.
 * https://api.dexscreener.com/latest/dex/tokens/<comma-separated addresses>  (≤30 each)
 */
const BASE = "https://api.dexscreener.com/latest/dex/tokens/";

export interface TokenMarket {
  address: string;
  chainId: string; // "solana" | "ethereum" | "bsc" | …
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  imageUrl: string | null;
  dexUrl: string | null;
}

interface DexPair {
  chainId?: string;
  url?: string;
  priceUsd?: string;
  marketCap?: number;
  fdv?: number;
  liquidity?: { usd?: number };
  priceChange?: { h24?: number };
  baseToken?: { address?: string; name?: string; symbol?: string };
  info?: { imageUrl?: string };
}

/** Pick the deepest-liquidity pair whose base token matches `address`. */
function bestPair(pairs: DexPair[], address: string): DexPair | null {
  const key = address.toLowerCase();
  const matches = pairs.filter((p) => p.baseToken?.address?.toLowerCase() === key);
  if (!matches.length) return null;
  return matches.reduce((a, b) => ((b.liquidity?.usd ?? 0) > (a.liquidity?.usd ?? 0) ? b : a));
}

function toMarket(address: string, pair: DexPair): TokenMarket {
  return {
    address,
    chainId: pair.chainId ?? "",
    symbol: pair.baseToken?.symbol ?? "",
    name: pair.baseToken?.name ?? "",
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : null,
    change24h: typeof pair.priceChange?.h24 === "number" ? pair.priceChange.h24 : null,
    marketCap: pair.marketCap ?? pair.fdv ?? null,
    imageUrl: pair.info?.imageUrl ?? null,
    dexUrl: pair.url ?? null,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Fetch markets for many addresses. Returns a map keyed by lowercased address. */
export async function fetchMarkets(addresses: string[]): Promise<Record<string, TokenMarket>> {
  const out: Record<string, TokenMarket> = {};
  await Promise.all(
    chunk(addresses, 30).map(async (batch) => {
      try {
        const res = await fetch(BASE + batch.join(","), { next: { revalidate: 60 } });
        if (!res.ok) return;
        const j = (await res.json()) as { pairs?: DexPair[] };
        const pairs = j.pairs ?? [];
        for (const addr of batch) {
          const pair = bestPair(pairs, addr);
          if (pair) out[addr.toLowerCase()] = toMarket(addr, pair);
        }
      } catch {
        /* offline / rate-limited — leave these out */
      }
    })
  );
  return out;
}

/** Fetch a single token's market. */
export async function fetchMarket(address: string): Promise<TokenMarket | null> {
  const map = await fetchMarkets([address]);
  return map[address.toLowerCase()] ?? null;
}
