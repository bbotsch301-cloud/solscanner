import { NextRequest, NextResponse } from "next/server";

// Always run per-request (RPC calls are live); never statically cache.
export const dynamic = "force-dynamic";

/**
 * Server-side proxy for the Solana JSON-RPC endpoint. The mobile app points
 * `EXPO_PUBLIC_MAINNET_RPC` at `${YOUR_BACKEND}/api/rpc`; this route forwards each JSON-RPC POST to
 * the real upstream (e.g. a Helius URL) with the API key injected here — so the key never ships in
 * the app bundle and every user shares one operator-provided RPC with no per-user setup.
 *
 * Configure the upstream server-side (never exposed to the app), reusing the keys this backend
 * already documents — pick one:
 *   HELIUS_API_KEY=<key>                              (→ https://mainnet.helius-rpc.com/?api-key=…)
 *   MAINNET_RPC=https://<provider>/…                  (any full RPC URL; matches lib/liquidity, lib/tokens)
 * Falls back to the public endpoint if neither is set (so the route never hard-fails, it just isn't
 * faster). Upstream rate limits (and, on Helius, request/origin restrictions) are the abuse control;
 * this is a thin relay, not an open gateway.
 */
function upstream(): string {
  if (process.env.MAINNET_RPC) return process.env.MAINNET_RPC;
  if (process.env.HELIUS_API_KEY) return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  return process.env.NEXT_PUBLIC_MAINNET_RPC ?? "https://api.mainnet-beta.solana.com";
}
const isConfigured = () => !!(process.env.MAINNET_RPC || process.env.HELIUS_API_KEY);

export async function POST(req: NextRequest) {
  const body = await req.text();
  // Only forward well-formed JSON-RPC payloads (a single call or a batch array) — blocks casual
  // scans/abuse without maintaining a brittle method allowlist.
  try {
    const parsed = JSON.parse(body);
    const looksRpc = Array.isArray(parsed) ? parsed.every((x) => x && typeof x.method === "string") : typeof parsed?.method === "string";
    if (!looksRpc) throw new Error("not json-rpc");
  } catch {
    return NextResponse.json({ error: "Expected a JSON-RPC request body." }, { status: 400 });
  }

  try {
    const res = await fetch(upstream(), {
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
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: isConfigured()
      ? "POST JSON-RPC here (dedicated upstream configured)."
      : "POST JSON-RPC here. No dedicated upstream set (HELIUS_API_KEY / MAINNET_RPC) — relaying to the public endpoint.",
  });
}
