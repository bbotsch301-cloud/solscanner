/**
 * One resolved view per token, merging every source with a single precedence:
 *   manual override (showcase) → DexScreener → auto-fetch (Jupiter / on-chain) → fallback.
 * Both the gallery and the detail page render `TokenView`, so display is consistent and
 * any token — current or future, added by address alone — resolves a real name/ticker/logo.
 */
import { chainOf, type ShowcaseToken } from "./showcase";
import { fetchMarket, fetchMarkets, type TokenMarket } from "./dexscreener";
import { resolveMeta } from "./metadata";

export interface TokenView {
  address: string;
  /** Always non-empty (falls back to a shortened address). */
  name: string;
  symbol: string | null;
  logo: string | null;
  chainBadge: "SOL" | "ETH" | "BNB" | "EVM";
  priceUsd: number | null;
  change24h: number | null;
  marketCap: number | null;
  dexUrl: string | null;
}

function chainBadge(market: TokenMarket | undefined, address: string): TokenView["chainBadge"] {
  const id = market?.chainId;
  if (id === "solana") return "SOL";
  if (id === "ethereum") return "ETH";
  if (id === "bsc") return "BNB";
  return chainOf(address) === "evm" ? "EVM" : "SOL";
}

function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 5)}…${a.slice(-4)}` : a;
}

async function build(entry: ShowcaseToken, market: TokenMarket | undefined): Promise<TokenView> {
  // Seed with override → DexScreener; resolveMeta fills only the remaining gaps and
  // never overrides what's already set, so precedence is preserved end-to-end.
  const meta = await resolveMeta(entry.address, chainOf(entry.address), {
    name: entry.name ?? market?.name ?? undefined,
    symbol: entry.symbol ?? market?.symbol ?? undefined,
    logo: entry.logo ?? market?.imageUrl ?? undefined,
  });
  return {
    address: entry.address,
    name: meta.name || short(entry.address),
    symbol: meta.symbol ?? null,
    logo: meta.logo ?? null,
    chainBadge: chainBadge(market, entry.address),
    priceUsd: market?.priceUsd ?? null,
    change24h: market?.change24h ?? null,
    marketCap: market?.marketCap ?? null,
    dexUrl: market?.dexUrl ?? null,
  };
}

/** Resolve a whole list — one batched DexScreener call, then per-token gap fills. */
export async function resolveTokens(entries: ShowcaseToken[]): Promise<TokenView[]> {
  const markets = await fetchMarkets(entries.map((e) => e.address));
  return Promise.all(entries.map((e) => build(e, markets[e.address.toLowerCase()])));
}

/** Resolve a single token (detail page). */
export async function resolveToken(entry: ShowcaseToken): Promise<TokenView> {
  const market = await fetchMarket(entry.address);
  return build(entry, market ?? undefined);
}
