import { NextRequest, NextResponse } from "next/server";
import { adapterFor } from "@/lib/chains/select";

/**
 * GET /api/balances?address=...&kind=wallet|mint[&demo=1]
 * - wallet -> token balances held by the address
 * - mint   -> top holders of the mint
 * If kind is omitted it is inferred via classify().
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }
  const adapter = adapterFor(req);

  let kind = req.nextUrl.searchParams.get("kind") as "wallet" | "mint" | null;

  try {
    if (!kind) {
      const type = await adapter.classify(address);
      kind = type === "mint" ? "mint" : "wallet";
    }

    if (kind === "mint") {
      const holders = await adapter.getHolders(address, 100);
      return NextResponse.json({ kind, holders });
    }

    const balances = await adapter.getBalances(address);
    return NextResponse.json({ kind, balances });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
