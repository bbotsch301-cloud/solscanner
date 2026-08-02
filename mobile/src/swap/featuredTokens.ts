/**
 * Turns the curated address list in config/featuredTokens.ts into real, tradeable `SwapToken`s by
 * asking the chain for everything except the address.
 *
 * Why not just put decimals in the config: the picker renders these rows straight from the object,
 * so a hand-typed `decimals` is one the swap math trusts. Reading it from the mint / contract makes
 * that class of bug impossible, and gets the true symbol, name and logo for free.
 *
 * It's also what decides CHAIN MEMBERSHIP. Most of the supplied EVM addresses didn't say whether
 * they were Ethereum or BSC, so they're listed under both; a contract that isn't deployed on a
 * chain can't answer `decimals()`, so it quietly drops off that chain's list.
 *
 * Results are cached to disk. Decimals are immutable and symbols effectively never change, so after
 * the first open this is free and works offline.
 */
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { createDiskSnapshot } from "../cache/diskSnapshot";
import { featuredFor } from "../config/featuredTokens";
import { connection } from "../solana/connection";
import { cachedTokenMetas, fetchTokenMetas } from "../solana/tokens";
import { fetchDexInfo, type DexInfo } from "../solana/prices";
import { evmLogo } from "../config/logos";
import { ethCall } from "../evm/rpc";
import { isEvmAddress, toChecksumAddress } from "../wallet/evm";
import { shortAddress } from "../theme";
import { assertNever, type ChainDef, type ChainId } from "../chains/registry";
import type { SwapToken } from "./types";

/** 30 days. The underlying facts don't change; this is really just a "re-check eventually". */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// v2: entries resolved before logo lookup existed have no artwork, and with a 30-day horizon they
// would have kept rendering as bare initials for a month. Bumping the prefix retires them.
const cache = createDiskSnapshot<SwapToken[]>("featured.v2:", MAX_AGE_MS);

/** Warm the cache at startup so the first picker open paints instantly. */
export function preloadFeaturedTokens(): Promise<void> {
  return cache.preload();
}

/** Synchronously read the last-resolved list for a chain, or undefined. */
export function cachedFeaturedTokens(chain: ChainDef): SwapToken[] | undefined {
  return cache.get(chain.id);
}

// ---- Solana ----

/**
 * One `getMultipleParsedAccounts` covers every mint at once — the alternative, `resolveMint` per
 * address, is fifteen round-trips, and this app has already learned twice that fanning out on a
 * free-tier RPC makes coverage WORSE, not better (see solana/deposits.ts).
 */
async function resolveSolana(addresses: string[]): Promise<SwapToken[]> {
  const keys: PublicKey[] = [];
  const valid: string[] = [];
  for (const a of addresses) {
    try {
      keys.push(new PublicKey(a));
      valid.push(a);
    } catch {
      /* malformed address in the config — skip it rather than fail the whole list */
    }
  }
  if (!keys.length) return [];

  const { value } = await connection.getMultipleParsedAccounts(keys);
  const decimalsByMint = new Map<string, number>();
  value.forEach((account, i) => {
    if (!account || !("parsed" in account.data)) return; // not a mint (or doesn't exist)
    const d = account.data.parsed?.info?.decimals;
    if (typeof d === "number") decimalsByMint.set(valid[i], d);
  });
  if (!decimalsByMint.size) return [];

  // Names and logos come from the per-mint metadata cache, which is already persisted with a
  // 30-day TTL — so this usually costs nothing after the first run.
  const mints = [...decimalsByMint.keys()];
  const metas = { ...cachedTokenMetas(mints), ...(await fetchTokenMetas(mints).catch(() => ({}))) };

  return mints.map((mint) => ({
    mint,
    symbol: metas[mint]?.symbol ?? shortAddress(mint, 4, 4),
    decimals: decimalsByMint.get(mint)!,
    logoURI: metas[mint]?.logoURI,
    name: metas[mint]?.name,
    verified: false,
  }));
}

// ---- EVM ----

/** Decode an ABI string result (dynamic string, or a legacy bytes32 symbol). */
function decodeAbiString(hex: string): string {
  const raw = hex.replace(/^0x/, "");
  const toText = (slice: string) => {
    const pairs = slice.match(/../g);
    if (!pairs) return "";
    return new TextDecoder().decode(Uint8Array.from(pairs.map((b) => parseInt(b, 16)))).replace(/\0+$/, "");
  };
  if (raw.length >= 128) {
    const len = parseInt(raw.slice(64, 128), 16);
    if (len > 0 && len <= 128) {
      const text = toText(raw.slice(128, 128 + len * 2));
      if (text) return text;
    }
  }
  try {
    return toText(raw.slice(0, 64));
  } catch {
    return "";
  }
}

const SIG_DECIMALS = "0x313ce567";
const SIG_SYMBOL = "0x95d89b41";
const SIG_NAME = "0x06fdde03";

/**
 * `decimals()` doubles as the existence probe: a contract that isn't on this chain can't answer it,
 * and we need the value anyway. Only addresses that pass cost the extra symbol/name calls.
 */
async function resolveEvmOne(chain: ChainDef, address: string): Promise<SwapToken | null> {
  if (!isEvmAddress(address)) return null;
  const to = toChecksumAddress(address);
  try {
    const decHex = await ethCall(chain, to, SIG_DECIMALS);
    if (!decHex || decHex === "0x") return null; // no contract here
    const decimals = Number(BigInt(decHex));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
    const [symHex, nameHex] = await Promise.all([
      ethCall(chain, to, SIG_SYMBOL).catch(() => ""),
      ethCall(chain, to, SIG_NAME).catch(() => ""),
    ]);
    const symbol = decodeAbiString(symHex) || shortAddress(to, 4, 4);
    return { mint: to, symbol, name: decodeAbiString(nameHex) || symbol, decimals, verified: false };
  } catch {
    return null; // reverted, absent, or the RPC refused — either way, not shown
  }
}

/** Concurrent probes per wave — small on purpose; a burst is what gets a free RPC to start refusing. */
const EVM_WAVE = 4;

async function resolveEvm(chain: ChainDef, addresses: string[]): Promise<SwapToken[]> {
  const out: SwapToken[] = [];
  for (let i = 0; i < addresses.length; i += EVM_WAVE) {
    const wave = await Promise.all(addresses.slice(i, i + EVM_WAVE).map((a) => resolveEvmOne(chain, a)));
    for (const t of wave) if (t) out.push(t);
  }
  if (!out.length) return out;

  // The contract knows its symbol, name and decimals but has no idea what it looks like, so these
  // rendered as bare initials while the built-in majors beside them had artwork. DexScreener
  // carries token images for anything with a live pool — which is exactly the small-caps a token
  // registry won't have. One batched request for the whole list.
  //
  // Falling back to the Trust Wallet CDN path costs nothing when it misses: TokenAvatar advances
  // through its candidates on error and lands on initials, which is where we already were.
  const chainSlug = chain.id === "ethereum" || chain.id === "bsc" ? chain.id : null;
  if (!chainSlug) return out;
  const info = await fetchDexInfo(out.map((t) => t.mint), chainSlug).catch(() => ({}) as Record<string, DexInfo>);
  const trustSlug = chain.id === "ethereum" ? "ethereum" : "smartchain";
  return out.map((t) => ({
    ...t,
    logoURI: info[t.mint]?.imageUrl ?? evmLogo(trustSlug, t.mint),
  }));
}

/** Resolve a chain's featured list from scratch and persist it. */
export async function loadFeaturedTokens(chain: ChainDef): Promise<SwapToken[]> {
  const addresses = featuredFor(chain.id).map((t) => t.address);
  if (!addresses.length) return [];
  const tokens = await (async () => {
    switch (chain.kind) {
      case "solana":
        return resolveSolana(addresses);
      case "evm":
        return resolveEvm(chain, addresses);
      default:
        return assertNever(chain.kind, "chain kind in loadFeaturedTokens");
    }
  })();
  // Don't persist a total failure over a good list — an outage would otherwise blank the section
  // until the cache aged out. Same rule as the treasury snapshot's `depositsLoaded`.
  if (tokens.length) cache.set(chain.id, tokens);
  return tokens;
}

/**
 * The featured list for a chain: cached rows immediately, a refresh behind them.
 * `loading` is true only when there's nothing to show yet — that's the skeleton case.
 */
export function useFeaturedTokens(chain: ChainDef): { tokens: SwapToken[]; loading: boolean } {
  // Which chain we've finished resolving. Derived rather than a flag flipped on the way in, so
  // nothing is set synchronously inside the effect — and so a chain switch reads as "not settled"
  // immediately, without an extra render to reset it.
  const [resolved, setResolved] = useState<{ id: ChainId; tokens: SwapToken[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await loadFeaturedTokens(chain).catch(() => [] as SwapToken[]);
      if (!cancelled) setResolved({ id: chain.id, tokens: fresh });
    })();
    return () => {
      cancelled = true;
    };
  }, [chain]);

  const settled = resolved?.id === chain.id;
  // Falls back to the warm cache on every render (a Map lookup), which covers both the first paint
  // and a chain switch — the section never blanks while the new chain resolves.
  const tokens = settled && resolved.tokens.length ? resolved.tokens : cache.get(chain.id) ?? [];
  return { tokens, loading: tokens.length === 0 && !settled };
}
