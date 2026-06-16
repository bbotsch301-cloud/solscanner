/**
 * Raw Helius client. Server-only: reads HELIUS_API_KEY from the environment and
 * must never be imported into client components. Wraps two Helius surfaces:
 *   - JSON-RPC (DAS + standard RPC) at mainnet.helius-rpc.com
 *   - Enhanced Transactions REST at api-mainnet.helius-rpc.com/v0
 */

const RPC_BASE = "https://mainnet.helius-rpc.com";
const ENHANCED_BASE = "https://api-mainnet.helius-rpc.com/v0";

function apiKey(): string {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    throw new Error(
      "HELIUS_API_KEY is not set. Copy .env.local.example to .env.local and add your key."
    );
  }
  return key;
}

// --- Tiny TTL cache (per server process) to avoid re-fetching the same address. ---

interface CacheEntry<T> {
  value: T;
  expires: number;
}
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Evict oldest insertion (Map preserves insertion order).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

// --- JSON-RPC ---

let rpcId = 0;

export async function rpc<T = unknown>(
  method: string,
  params: unknown,
  opts: { cache?: boolean } = {}
): Promise<T> {
  const cacheKey = opts.cache ? `rpc:${method}:${JSON.stringify(params)}` : null;
  if (cacheKey) {
    const cached = cacheGet<T>(cacheKey);
    if (cached !== undefined) return cached;
  }

  const res = await fetch(`${RPC_BASE}/?api-key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Helius RPC ${method} failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(`Helius RPC ${method} error: ${json.error.message ?? "unknown"}`);
  }
  const result = json.result as T;
  if (cacheKey) cacheSet(cacheKey, result);
  return result;
}

// --- Enhanced Transactions REST ---

export interface EnhancedTransaction {
  signature: string;
  timestamp: number;
  type?: string;
  source?: string;
  tokenTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    fromTokenAccount?: string;
    toTokenAccount?: string;
    tokenAmount?: number;
    mint?: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount?: string;
    toUserAccount?: string;
    amount?: number; // lamports
  }>;
}

export async function enhancedTransactionsByAddress(
  address: string,
  opts: { limit?: number; before?: string; type?: string } = {}
): Promise<EnhancedTransaction[]> {
  const params = new URLSearchParams({ "api-key": apiKey() });
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.before) params.set("before", opts.before);
  if (opts.type) params.set("type", opts.type);

  const cacheKey = `enh:${address}:${opts.limit ?? ""}:${opts.before ?? ""}:${opts.type ?? ""}`;
  const cached = cacheGet<EnhancedTransaction[]>(cacheKey);
  if (cached !== undefined) return cached;

  const url = `${ENHANCED_BASE}/addresses/${address}/transactions?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(
      `Helius enhanced transactions failed: ${res.status} ${res.statusText}`
    );
  }
  const json = (await res.json()) as EnhancedTransaction[];
  cacheSet(cacheKey, json);
  return json;
}

export { RPC_BASE, ENHANCED_BASE };
