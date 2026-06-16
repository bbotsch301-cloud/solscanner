import type { NextRequest } from "next/server";
import type { ChainAdapter } from "./types";
import { solanaAdapter } from "./solana/adapter";
import { demoAdapter } from "../demo/demoAdapter";

/** Picks the demo adapter when ?demo=1 is present, else the live Helius adapter. */
export function adapterFor(req: NextRequest): ChainAdapter {
  return req.nextUrl.searchParams.get("demo") === "1"
    ? demoAdapter
    : solanaAdapter;
}
