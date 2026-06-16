import { NextRequest, NextResponse } from "next/server";
import { solanaAdapter } from "@/lib/chains/solana/adapter";
import { classifyAddress } from "@/lib/analysis/heuristics";
import { getLabel } from "@/lib/labels/labels";

/** GET /api/entity?address=... — classifies an address and returns a summary. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const type = await solanaAdapter.classify(address);
    // Only walk signatures for wallet-like entities (firstSeen feeds "fresh").
    const info =
      type === "wallet" || type === "unknown"
        ? await solanaAdapter.getAccountInfo(address)
        : undefined;
    const label = getLabel(address);
    const flags = classifyAddress({ address, firstSeen: info?.firstSeen });

    return NextResponse.json({ address, type, label, info, flags });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
