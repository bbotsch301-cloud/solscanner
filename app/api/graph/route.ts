import { NextRequest, NextResponse } from "next/server";
import { solanaAdapter } from "@/lib/chains/solana/adapter";
import { buildGraph } from "@/lib/analysis/graph";

/**
 * GET /api/graph?address=...&maxFanout=50
 * Returns a one-hop graph centered on the address. The client expands further by
 * re-requesting this endpoint centered on a clicked node and merging the result.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const maxFanoutRaw = req.nextUrl.searchParams.get("maxFanout");
  const maxFanout = maxFanoutRaw ? Number(maxFanoutRaw) : undefined;

  try {
    const transfers = await solanaAdapter.getTransfers(address, { limit: 100 });
    const graph = buildGraph(transfers, { center: address, maxFanout });
    return NextResponse.json(graph);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
