import { NextRequest, NextResponse } from "next/server";
import { buildAddTx, NotConfiguredError } from "@/lib/liquidity/raydium.server";

export const dynamic = "force-dynamic";

/**
 * POST /api/liquidity/add  { owner, xgoAmount, slippageBps? }
 * Returns { tx } — a base64 VersionedTransaction for the wallet to sign + submit.
 */
export async function POST(req: NextRequest) {
  try {
    const { owner, xgoAmount, slippageBps } = (await req.json()) as {
      owner?: string;
      xgoAmount?: string;
      slippageBps?: number;
    };
    if (!owner || !xgoAmount) {
      return NextResponse.json({ error: "owner and xgoAmount are required" }, { status: 400 });
    }
    const tx = await buildAddTx(owner, String(xgoAmount), Number(slippageBps ?? 100));
    return NextResponse.json({ tx });
  } catch (e) {
    const status = e instanceof NotConfiguredError ? 409 : 502;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
