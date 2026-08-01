/**
 * Token metadata (symbol / name / logo) resolved by mint. Known majors are
 * built in; anything else is looked up from Jupiter's token API (best-effort).
 * Devnet test tokens usually aren't listed anywhere — those fall back to a short
 * mint, which is expected.
 */
import { PublicKey } from "@solana/web3.js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { connection } from "./connection";
import { solLogo, LOGO_OVERRIDES } from "../config/logos";

// Persistent metadata cache key prefix. Bump the version to invalidate all stored entries.
const TM_KEY = "tm.v1:";

async function readPersisted(mint: string): Promise<TokenMeta | undefined> {
  try {
    const raw = await AsyncStorage.getItem(TM_KEY + mint);
    return raw ? (JSON.parse(raw) as TokenMeta) : undefined;
  } catch {
    return undefined;
  }
}
function writePersisted(mint: string, meta: TokenMeta): void {
  AsyncStorage.setItem(TM_KEY + mint, JSON.stringify(meta)).catch(() => {});
}

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

/**
 * Normalize any IPFS reference to a reliable HTTPS gateway. Handles ipfs://, a bare CID, and
 * full /ipfs/<cid> URLs (so we can re-route a slow ipfs.io link). pump.fun pins its token
 * metadata + images on its own Pinata gateway, which is far more reliable on mobile than the
 * public ipfs.io — and the treasury's holdings are almost entirely pump.fun tokens. Non-IPFS
 * URLs (arweave, direct https) pass through unchanged.
 */
function toHttp(uri: string, mint?: string): string {
  const u = uri.trim();
  const cid =
    u.match(/^ipfs:\/\/(.+)$/i)?.[1] ??
    u.match(/\/ipfs\/([A-Za-z0-9][^?#]*)/i)?.[1] ??
    (/^[A-Za-z0-9]{46,}$/.test(u) ? u : null);
  if (cid) {
    // pump.fun tokens pin their content on pump's own gateway (reliable on mobile); keep the
    // public gateway for everything else so non-pump tokens don't regress.
    const gw = mint?.endsWith("pump") ? "https://pump.mypinata.cloud/ipfs/" : "https://ipfs.io/ipfs/";
    return `${gw}${cid}`;
  }
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
        const res = await fetch(toHttp(uri.value, mint));
        if (res.ok) {
          const j = (await res.json()) as { image?: string } | null;
          if (j?.image) logoURI = toHttp(j.image, mint);
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
      // Normalize an IPFS logo to an HTTPS gateway so it can actually load on mobile.
      if (j?.symbol) return { symbol: j.symbol, name: j.name ?? j.symbol, logoURI: j.logoURI ? toHttp(j.logoURI, mint) : undefined };
    }
  } catch {
    /* offline / not listed */
  }
  return undefined;
}

/** A logo we can trust to load on mobile: a plain HTTPS URL that isn't an IPFS/Arweave
 *  gateway (those are slow/flaky on-device). Used to prefer a CDN image when several exist. */
function isReliableLogo(u?: string): boolean {
  return !!u && /^https?:\/\//i.test(u) && !/\/ipfs\/|ipfs\.io|arweave/i.test(u);
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

  // Persistent cache (survives app restarts): a stored hit skips all network resolution.
  const persisted = await readPersisted(mint);
  if (persisted) {
    cache.set(mint, persisted);
    return persisted;
  }

  // Jupiter (fast, name+symbol) and DexScreener (reliable CDN image) in parallel; on-chain
  // Metaplex only if either name/symbol or a logo is still missing (keeps RPC load down).
  const [jup, dex] = await Promise.all([fromJupiter(mint), fromDexScreener(mint)]);
  const haveSymbol = !!(jup?.symbol || dex?.symbol);
  const haveLogo = !!(jup?.logoURI || dex?.logoURI);
  const onchain = haveSymbol && haveLogo ? undefined : await fetchOnChainMeta(mint);

  const symbol = jup?.symbol || dex?.symbol || onchain?.symbol;
  const name = jup?.name || dex?.name || onchain?.name || symbol;

  // Prefer a CDN (non-IPFS) logo — DexScreener's is the most mobile-reliable — then fall back
  // to any available one. A manual override always wins.
  const candidates = [dex?.logoURI, jup?.logoURI, onchain?.logoURI].filter(Boolean) as string[];
  let logoURI = candidates.find(isReliableLogo) ?? candidates[0];
  if (LOGO_OVERRIDES[mint]) logoURI = LOGO_OVERRIDES[mint];

  const result: TokenMeta | undefined = symbol ? { symbol, name: name ?? symbol, logoURI } : undefined;
  cache.set(mint, result ?? null);
  // Persist only fully-resolved entries (with a logo) — that's the expensive thing to keep on
  // disk. Logo-less / missed lookups stay in-memory so they retry (and may find a logo) later.
  if (result?.logoURI) writePersisted(mint, result);
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
