import { NextRequest, NextResponse } from "next/server";
import { buildRemoveTx, NotConfiguredError } from "@/lib/liquidity/raydium.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/liquidity/remove  { owner, pct }
 * Returns { tx } — a base64 VersionedTransaction for the wallet to sign + submit.
 */
export async function POST(req: NextRequest) {
  try {
    const { owner, pct } = (await req.json()) as { owner?: string; pct?: number };
    if (!owner || pct == null) {
      return NextResponse.json({ error: "owner and pct are required" }, { status: 400 });
    }
    const tx = await buildRemoveTx(owner, Number(pct));
    return NextResponse.json({ tx });
  } catch (e) {
    const status = e instanceof NotConfiguredError ? 409 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
