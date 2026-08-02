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

export async function POST(req: NextRequest) {
  const body = await req.text();
  // Only forward well-formed JSON-RPC (a single call or a batch array) — blocks casual scans/abuse
  // without a brittle method allowlist. Both Solana (batched getTransaction) and EVM payloads pass.
  try {
    const parsed = JSON.parse(body);
    const ok = Array.isArray(parsed)
      ? parsed.every((x) => x && typeof x.method === "string")
      : typeof parsed?.method === "string";
    if (!ok) throw new Error("not json-rpc");
  } catch {
    return NextResponse.json({ error: "Expected a JSON-RPC request body." }, { status: 400 });
  }

  try {
    const res = await fetch(upstreamFor(parseChain(req)), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const out = await res.text();
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
