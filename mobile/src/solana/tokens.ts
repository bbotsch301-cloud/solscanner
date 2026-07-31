/**
 * Token metadata (symbol / name / logo) resolved by mint. Known majors are
 * built in; anything else is looked up from Jupiter's token API (best-effort).
 * Devnet test tokens usually aren't listed anywhere — those fall back to a short
 * mint, which is expected.
 */
export interface TokenMeta {
  symbol: string;
  name: string;
  logoURI?: string;
}

const LOGO = (mint: string) =>
  `https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/${mint}/logo.png`;

const KNOWN: Record<string, TokenMeta> = {
  // XGO — the treasury/community token (Token-2022, 1.11% transfer fee).
  "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7": { symbol: "XGO", name: "XGO" },
  So11111111111111111111111111111111111111112: {
    symbol: "SOL",
    name: "Solana",
    logoURI: LOGO("So11111111111111111111111111111111111111112"),
  },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    symbol: "USDC",
    name: "USD Coin",
    logoURI: LOGO("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    symbol: "USDT",
    name: "Tether USD",
    logoURI: LOGO("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
  },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: {
    symbol: "BONK",
    name: "Bonk",
  },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: {
    symbol: "JUP",
    name: "Jupiter",
  },
};

const cache = new Map<string, TokenMeta | null>();

export async function fetchTokenMeta(mint: string): Promise<TokenMeta | undefined> {
  if (KNOWN[mint]) return KNOWN[mint];
  if (cache.has(mint)) return cache.get(mint) ?? undefined;
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (res.ok) {
      const j = (await res.json()) as {
        symbol?: string;
        name?: string;
        logoURI?: string;
      } | null;
      if (j && j.symbol) {
        const meta: TokenMeta = { symbol: j.symbol, name: j.name ?? j.symbol, logoURI: j.logoURI };
        cache.set(mint, meta);
        return meta;
      }
    }
  } catch {
    /* offline / not listed */
  }
  cache.set(mint, null);
  return undefined;
}

/** Resolve metadata for many mints at once. */
export async function fetchTokenMetas(
  mints: string[]
): Promise<Record<string, TokenMeta>> {
  const out: Record<string, TokenMeta> = {};
  await Promise.all(
    [...new Set(mints)].map(async (m) => {
      const meta = await fetchTokenMeta(m);
      if (meta) out[m] = meta;
    })
  );
  return out;
}
