/**
 * Token discovery for the swap picker. One Jupiter endpoint (Token API v2 search)
 * handles both "type a name/symbol" and "paste a mint address" — the query can be
 * any of those. For a brand-new mint Jupiter hasn't indexed yet, resolveMint falls
 * back to reading the mint on-chain so the user can still pick it (the quote will
 * tell them if there's no route).
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getMint } from "@solana/spl-token";
import { connection } from "./connection";
import { fetchTokenMeta } from "./tokens";
import type { SwapToken } from "./swap";
import { shortAddress } from "../theme";

const SEARCH_URL = "https://lite-api.jup.ag/tokens/v2/search";

/** Loosely typed shape — field names vary across Jupiter tiers, so read defensively. */
interface RawToken {
  id?: string;
  address?: string;
  mint?: string;
  symbol?: string;
  name?: string;
  icon?: string;
  logoURI?: string;
  decimals?: number;
  isVerified?: boolean;
  verified?: boolean;
  tags?: string[];
}

function toSwapToken(t: RawToken): SwapToken | null {
  const mint = t.id ?? t.address ?? t.mint;
  if (!mint || typeof t.decimals !== "number") return null;
  return {
    mint,
    symbol: t.symbol ?? shortAddress(mint, 4, 4),
    decimals: t.decimals,
    logoURI: t.icon ?? t.logoURI,
    name: t.name ?? t.symbol,
    verified: t.isVerified ?? t.verified ?? (t.tags ? t.tags.includes("verified") : undefined),
  };
}

/** True when a string could be a base58 Solana mint address. */
export function looksLikeMint(q: string): boolean {
  const s = q.trim();
  if (s.length < 32 || s.length > 44) return false;
  try {
    return Boolean(new PublicKey(s));
  } catch {
    return false;
  }
}

/**
 * Search tokens by name, symbol, or mint. Returns up to `limit` results, verified
 * first. Fails soft to an empty list (offline / not listed).
 */
export async function searchTokens(query: string, limit = 20): Promise<SwapToken[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const res = await fetch(`${SEARCH_URL}?query=${encodeURIComponent(q)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as RawToken[] | { tokens?: RawToken[] };
    const list = Array.isArray(data) ? data : (data.tokens ?? []);
    const mapped = list.map(toSwapToken).filter((t): t is SwapToken => t !== null);
    // Verified tokens first, otherwise keep Jupiter's (relevance) order.
    mapped.sort((a, b) => Number(b.verified ?? false) - Number(a.verified ?? false));
    return mapped.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Resolve a mint address straight from chain when search finds nothing. Reads the
 * mint under both token programs for decimals and enriches with any known metadata.
 */
export async function resolveMint(mintStr: string): Promise<SwapToken | null> {
  if (!looksLikeMint(mintStr)) return null;
  const mint = new PublicKey(mintStr.trim());
  let decimals: number | null = null;
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const info = await getMint(connection, mint, "confirmed", programId);
      decimals = info.decimals;
      break;
    } catch {
      /* try the other program */
    }
  }
  if (decimals == null) return null;

  const meta = await fetchTokenMeta(mint.toBase58()).catch(() => undefined);
  return {
    mint: mint.toBase58(),
    symbol: meta?.symbol ?? shortAddress(mint.toBase58(), 4, 4),
    decimals,
    logoURI: meta?.logoURI,
    name: meta?.name,
    verified: false,
  };
}
