/**
 * Token metadata (symbol / name / logo) resolved by mint. Known majors are
 * built in; anything else is looked up from Jupiter's token API (best-effort).
 * Devnet test tokens usually aren't listed anywhere — those fall back to a short
 * mint, which is expected.
 */
import { PublicKey } from "@solana/web3.js";
import { connection } from "./connection";
import { solLogo } from "../config/logos";

export interface TokenMeta {
  symbol: string;
  name: string;
  logoURI?: string;
}

const KNOWN: Record<string, TokenMeta> = {
  // XGO — the treasury/community token (Token-2022, 1.11% transfer fee).
  "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7": { symbol: "XGO", name: "XGO" },
  So11111111111111111111111111111111111111112: { symbol: "SOL", name: "Solana", logoURI: solLogo["So11111111111111111111111111111111111111112"] },
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", name: "USD Coin", logoURI: solLogo["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"] },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", name: "Tether USD", logoURI: solLogo["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"] },
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: { symbol: "BONK", name: "Bonk", logoURI: solLogo["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"] },
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: { symbol: "JUP", name: "Jupiter", logoURI: solLogo["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"] },
};

const cache = new Map<string, TokenMeta | null>();

const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** ipfs:// and bare-CID URIs → an HTTPS gateway; https/http pass through. */
function toHttp(uri: string): string {
  const u = uri.trim();
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice("ipfs://".length)}`;
  if (/^[A-Za-z0-9]{46,}$/.test(u)) return `https://ipfs.io/ipfs/${u}`;
  return u;
}

const utf8 = new TextDecoder();

function readU32LE(buf: Uint8Array, o: number): number {
  return (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
}

/** Read a borsh String (u32-LE length + bytes) at `offset`; UTF-8 decoded, NUL-trimmed.
 *  Uses TextDecoder (not Buffer.toString) so it works whether the account data is a
 *  Buffer or a plain Uint8Array in React Native. */
function readBorshString(buf: Uint8Array, offset: number): { value: string; next: number } {
  const len = readU32LE(buf, offset);
  const start = offset + 4;
  const raw = utf8.decode(buf.subarray(start, start + len));
  return { value: raw.replace(/\0/g, "").trim(), next: start + len };
}

/**
 * On-chain Metaplex metadata — the fallback when Jupiter doesn't list a token (e.g. fresh
 * pump.fun memecoins like Giraffe). Reads the metadata account for name/symbol, then its
 * off-chain JSON for the image. Best-effort; mainnet only.
 */
async function fetchOnChainMeta(mint: string): Promise<TokenMeta | undefined> {
  try {
    const mintKey = new PublicKey(mint);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), mintKey.toBuffer()],
      TOKEN_METADATA_PROGRAM
    );
    const info = await connection.getAccountInfo(pda);
    if (!info?.data) return undefined;
    const data = info.data as Uint8Array;

    // key(1) + updateAuthority(32) + mint(32) → name starts at 65.
    const name = readBorshString(data, 1 + 32 + 32);
    const symbol = readBorshString(data, name.next);
    const uri = readBorshString(data, symbol.next);
    if (!name.value && !symbol.value) return undefined;

    let logoURI: string | undefined;
    if (uri.value) {
      try {
        const res = await fetch(toHttp(uri.value));
        if (res.ok) {
          const j = (await res.json()) as { image?: string } | null;
          if (j?.image) logoURI = toHttp(j.image);
        }
      } catch {
        /* off-chain JSON unreachable — keep name/symbol */
      }
    }
    return { symbol: symbol.value || name.value, name: name.value || symbol.value, logoURI };
  } catch {
    return undefined;
  }
}

async function fromJupiter(mint: string): Promise<TokenMeta | undefined> {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`);
    if (res.ok) {
      const j = (await res.json()) as { symbol?: string; name?: string; logoURI?: string } | null;
      if (j?.symbol) return { symbol: j.symbol, name: j.name ?? j.symbol, logoURI: j.logoURI };
    }
  } catch {
    /* offline / not listed */
  }
  return undefined;
}

/** DexScreener — reliable HTTPS CDN logo (and name/symbol) for any pooled token. */
async function fromDexScreener(mint: string): Promise<TokenMeta | undefined> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return undefined;
    const j = (await res.json()) as {
      pairs?: { baseToken?: { address?: string; name?: string; symbol?: string }; info?: { imageUrl?: string } }[];
    };
    const mine = (j.pairs ?? []).filter((p) => p.baseToken?.address?.toLowerCase() === mint.toLowerCase());
    if (!mine.length) return undefined;
    const best = mine.find((p) => p.info?.imageUrl) ?? mine[0];
    const bt = best.baseToken ?? {};
    if (!bt.symbol && !best.info?.imageUrl) return undefined;
    return { symbol: bt.symbol ?? "", name: bt.name ?? bt.symbol ?? "", logoURI: best.info?.imageUrl };
  } catch {
    return undefined;
  }
}

export async function fetchTokenMeta(mint: string): Promise<TokenMeta | undefined> {
  if (KNOWN[mint]) return KNOWN[mint];
  if (cache.has(mint)) return cache.get(mint) ?? undefined;

  // Merge across sources: name/symbol from the first that has them, logo from the first
  // that has one. Jupiter (fast) → DexScreener (reliable CDN logo) → on-chain (unlisted).
  const merged: { symbol?: string; name?: string; logoURI?: string } = {};
  const fill = (m?: TokenMeta) => {
    if (!m) return;
    merged.symbol ||= m.symbol || undefined;
    merged.name ||= m.name || undefined;
    merged.logoURI ||= m.logoURI || undefined;
  };

  fill(await fromJupiter(mint));
  if (!merged.symbol || !merged.logoURI) fill(await fromDexScreener(mint));
  if (!merged.symbol || !merged.logoURI) fill(await fetchOnChainMeta(mint));

  const result: TokenMeta | undefined = merged.symbol
    ? { symbol: merged.symbol, name: merged.name ?? merged.symbol, logoURI: merged.logoURI }
    : undefined;
  cache.set(mint, result ?? null);
  return result;
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
