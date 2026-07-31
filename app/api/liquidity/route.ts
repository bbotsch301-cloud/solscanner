import { NextRequest, NextResponse } from "next/server";
import { getSnapshot, NotConfiguredError } from "@/lib/liquidity/raydium.server";
import { isPoolConfigured } from "@/lib/liquidity/config";

// Always run fresh (reserves change every trade); never statically cache.
export const dynamic = "force-dynamic";

/** GET /api/liquidity?owner=<pubkey> — pool snapshot + optional owner position. */
export async function GET(req: NextRequest) {
  if (!isPoolConfigured()) {
    return NextResponse.json({
      configured: false,
      poolId: null,
      priceSolPerXgo: null,
      reserves: null,
      tvlUsd: null,
      volume24hUsd: null,
      fees24hUsd: null,
      position: null,
    });
  }
  const owner = req.nextUrl.searchParams.get("owner")?.trim() || undefined;
  try {
    return NextResponse.json(await getSnapshot(owner));
  } catch (e) {
    const status = e instanceof NotConfiguredError ? 200 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
