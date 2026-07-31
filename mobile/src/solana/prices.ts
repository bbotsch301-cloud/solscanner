/**
 * Live USD prices from Jupiter's public Price API v3 (no key required).
 * Keyed by mint; native SOL is priced via the wrapped-SOL mint.
 * Note: devnet SPL test tokens generally won't have a market price.
 */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export interface PriceInfo {
  usdPrice: number;
  /** 24h change as a percentage, e.g. 1.29 = +1.29%. */
  priceChange24h?: number;
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
  return out;
}
