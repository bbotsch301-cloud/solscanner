import { NextRequest, NextResponse } from "next/server";
import { adapterFor } from "@/lib/chains/select";
import { classifyAddress } from "@/lib/analysis/heuristics";
import { concentration, firstInboundFunding } from "@/lib/analysis/forensics";
import { getLabel } from "@/lib/labels/labels";

/** GET /api/entity?address=...[&demo=1] — classifies an address and returns a summary. */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const adapter = adapterFor(req);

  try {
    const type = await adapter.classify(address);

    if (type === "mint") {
      // Mint summary: holder concentration is the headline forensic signal.
      const holders = await adapter.getHolders(address, 100);
      const label = getLabel(address);
      return NextResponse.json({
        address,
        type,
        label,
        flags: classifyAddress({ address }),
        concentration: concentration(holders),
      });
    }

    // Wallet/program/unknown: account info + first-funding hint.
    const [info, transfers] = await Promise.all([
      adapter.getAccountInfo(address),
      adapter.getTransfers(address, { limit: 100 }),
    ]);
    const label = getLabel(address);
    const flags = classifyAddress({ address, firstSeen: info?.firstSeen });
    const funding = firstInboundFunding(transfers, address);

    return NextResponse.json({
      address,
      type,
      label,
      info,
      flags,
      funding: funding
        ? { ...funding, sourceLabel: getLabel(funding.source) }
        : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
