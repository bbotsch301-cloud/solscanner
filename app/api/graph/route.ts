import { NextRequest, NextResponse } from "next/server";
import { adapterFor } from "@/lib/chains/select";
import { buildGraph } from "@/lib/analysis/graph";

/**
 * GET /api/graph?address=...&maxFanout=50[&demo=1]
 * Returns a one-hop graph centered on the address. The client expands further by
 * re-requesting this endpoint centered on a clicked node and merging the result.
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const adapter = adapterFor(req);
  const maxFanoutRaw = req.nextUrl.searchParams.get("maxFanout");
  const maxFanout = maxFanoutRaw ? Number(maxFanoutRaw) : undefined;

  try {
    const [transfers, nodeMeta] = await Promise.all([
      adapter.getTransfers(address, { limit: 100 }),
      adapter.getGraphMeta ? adapter.getGraphMeta(address) : Promise.resolve(undefined),
    ]);
    const graph = buildGraph(transfers, { center: address, maxFanout, nodeMeta });
    return NextResponse.json(graph);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
