import { NextRequest, NextResponse } from "next/server";

// Always run per-request (RPC calls are live); never statically cache.
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for Solana + EVM JSON-RPC. The mobile app points each network's RPC at
 * `${YOUR_BACKEND}/api/rpc?chain=<chain>`; this route forwards the JSON-RPC POST to the real upstream
 * with the provider key injected here — so keys never ship in the app and every user shares one
 * operator-provided RPC per network, with no per-user setup.
 *
 * `?chain=` selects the network (default `solana-mainnet`, so the plain `/api/rpc` URL keeps working):
 *   solana-mainnet · solana-devnet · ethereum · bsc
 *
 * Configure upstreams server-side (never exposed), reusing the keys this backend already documents.
 * Each falls back to the public endpoint so the route never hard-fails, it just isn't faster:
 *   HELIUS_API_KEY=<key>          → Helius mainnet + devnet
 *   MAINNET_RPC / DEVNET_RPC=<url> → any full Solana RPC URL (MAINNET_RPC also feeds lib/liquidity)
 *   ETH_RPC / BSC_RPC=<url>        → keyed EVM providers (Alchemy/Infura/QuickNode)
 * Upstream rate limits (and provider origin/key restrictions) are the abuse control; this is a thin
 * relay, not an open gateway.
 */
type Chain = "solana-mainnet" | "solana-devnet" | "ethereum" | "bsc";
const CHAINS = new Set<Chain>(["solana-mainnet", "solana-devnet", "ethereum", "bsc"]);
const heliusUrl = (net: "mainnet" | "devnet") =>
  process.env.HELIUS_API_KEY ? `https://${net}.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "";

function upstreamFor(chain: Chain): string {
  switch (chain) {
    case "solana-devnet":
      return process.env.DEVNET_RPC || heliusUrl("devnet") || process.env.NEXT_PUBLIC_DEVNET_RPC || "https://api.devnet.solana.com";
    case "ethereum":
      return process.env.ETH_RPC || "https://ethereum-rpc.publicnode.com";
    case "bsc":
      return process.env.BSC_RPC || "https://bsc-rpc.publicnode.com";
    case "solana-mainnet":
    default:
      return process.env.MAINNET_RPC || heliusUrl("mainnet") || process.env.NEXT_PUBLIC_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
  }
}

function parseChain(req: NextRequest): Chain {
  const c = req.nextUrl.searchParams.get("chain") ?? "solana-mainnet";
  return CHAINS.has(c as Chain) ? (c as Chain) : "solana-mainnet";
}

/**
 * Shared-data cache. Identical read queries from many users — the treasury's token accounts, XGO
 * supply/fee, holdings — collapse to ONE upstream call instead of thousands. Keyed by (chain, method,
 * params) so per-user queries (different addresses) never share an entry. OFF by default: set
 * RPC_CACHE_TTL_MS (e.g. 5000) to enable. Only successful single-call reads are cached; mutating and
 * freshness-sensitive methods are never cached. Note: this is per warm serverless instance — for a
 * cross-instance cache at large scale, back it with Vercel KV / Redis.
 */
const CACHE_TTL_MS = Number(process.env.RPC_CACHE_TTL_MS ?? 0);
const CACHE_MAX = 1000;
const NO_CACHE = new Set([
  "sendTransaction", "requestAirdrop", "simulateTransaction", "getLatestBlockhash", "getRecentBlockhash",
  "getSignatureStatuses", "getFeeForMessage", "isBlockhashValid", "getSlot", "getBlockHeight",
  "eth_sendRawTransaction", "eth_estimateGas", "eth_gasPrice", "eth_getTransactionCount", "eth_blockNumber",
]);
const cache = new Map<string, { result: unknown; expires: number }>();

export async function POST(req: NextRequest) {
  const body = await req.text();
  // Only forward well-formed JSON-RPC (a single call or a batch array) — blocks casual scans/abuse
  // without a brittle method allowlist. Both Solana (batched getTransaction) and EVM payloads pass.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
    const ok = Array.isArray(parsed)
      ? parsed.every((x) => x && typeof x.method === "string")
      : typeof (parsed as { method?: unknown })?.method === "string";
    if (!ok) throw new Error("not json-rpc");
  } catch {
    return NextResponse.json({ error: "Expected a JSON-RPC request body." }, { status: 400 });
  }

  const chain = parseChain(req);
  // Cache key for a single cacheable read (batches and mutating/fresh methods pass straight through).
  const single = Array.isArray(parsed) ? null : (parsed as { method: string; params?: unknown; id?: unknown });
  const key =
    CACHE_TTL_MS > 0 && single && !NO_CACHE.has(single.method)
      ? `${chain}|${single.method}|${JSON.stringify(single.params ?? null)}`
      : null;

  if (key) {
    const hit = cache.get(key);
    if (hit && hit.expires > Date.now()) {
      // Return the cached result under THIS request's id (JSON-RPC clients match responses by id).
      return NextResponse.json({ jsonrpc: "2.0", id: single!.id ?? null, result: hit.result });
    }
  }

  try {
    const res = await fetch(upstreamFor(chain), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const out = await res.text();
    if (key && res.ok) {
      try {
        const j = JSON.parse(out) as { result?: unknown; error?: unknown };
        if (j && j.result !== undefined && j.error === undefined) {
          cache.set(key, { result: j.result, expires: Date.now() + CACHE_TTL_MS });
          if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
        }
      } catch {
        /* uncacheable response — just pass it through */
      }
    }
    return new NextResponse(out, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Upstream RPC request failed." }, { status: 502 });
  }
}

/** Friendly response when the URL is opened in a browser (the app uses POST). */
export async function GET(req: NextRequest) {
  const chain = parseChain(req);
  const dedicated =
    (chain.startsWith("solana") && !!(process.env.MAINNET_RPC || process.env.DEVNET_RPC || process.env.HELIUS_API_KEY)) ||
    (chain === "ethereum" && !!process.env.ETH_RPC) ||
    (chain === "bsc" && !!process.env.BSC_RPC);
  return NextResponse.json({
    ok: true,
    chain,
    hint: dedicated
      ? "POST JSON-RPC here (dedicated upstream configured)."
      : "POST JSON-RPC here. No dedicated upstream for this chain — relaying to the public endpoint.",
  });
}
