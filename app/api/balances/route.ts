import { NextRequest, NextResponse } from "next/server";
import { solanaAdapter } from "@/lib/chains/solana/adapter";

/**
 * GET /api/balances?address=...&kind=wallet|mint
 * - wallet -> token balances held by the address
 * - mint   -> top holders of the mint
 * If kind is omitted it is inferred via classify().
 */
export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  let kind = req.nextUrl.searchParams.get("kind") as
    | "wallet"
    | "mint"
    | null;

  try {
    if (!kind) {
      const type = await solanaAdapter.classify(address);
      kind = type === "mint" ? "mint" : "wallet";
    }

    if (kind === "mint") {
      const holders = await solanaAdapter.getHolders(address, 100);
      return NextResponse.json({ kind, holders });
    }

    const balances = await solanaAdapter.getBalances(address);
    return NextResponse.json({ kind, balances });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
