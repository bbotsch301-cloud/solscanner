import { describe, expect, it } from "vitest";
import { demoAdapter } from "../demo/demoAdapter";
import { DEMO_MINT, DEMO_WALLET, BINANCE } from "../demo/dataset";
import { buildGraph } from "../analysis/graph";
import { concentration } from "../analysis/forensics";

describe("demo adapter", () => {
  it("classifies the demo mint and wallet", async () => {
    expect(await demoAdapter.classify(DEMO_MINT)).toBe("mint");
    expect(await demoAdapter.classify(DEMO_WALLET)).toBe("wallet");
  });

  it("builds a flagged, labeled graph for the demo wallet", async () => {
    const transfers = await demoAdapter.getTransfers(DEMO_WALLET);
    const meta = await demoAdapter.getGraphMeta!(DEMO_WALLET);
    const g = buildGraph(transfers, { center: DEMO_WALLET, nodeMeta: meta });

    const center = g.nodes.find((n) => n.id === DEMO_WALLET);
    // 6% holder, first seen 5 days ago -> whale + fresh.
    expect(center?.flags).toEqual(expect.arrayContaining(["whale", "fresh"]));

    const binance = g.nodes.find((n) => n.id === BINANCE);
    expect(binance?.flags).toContain("cex");
  });

  it("expands: Binance connects back to the demo wallet (funding)", async () => {
    const transfers = await demoAdapter.getTransfers(BINANCE);
    const g = buildGraph(transfers, { center: BINANCE });
    expect(g.nodes.map((n) => n.id)).toContain(DEMO_WALLET);
  });

  it("reports holder concentration for the demo mint", async () => {
    const holders = await demoAdapter.getHolders(DEMO_MINT);
    const c = concentration(holders);
    expect(c.holderCount).toBeGreaterThan(0);
    expect(c.top1Pct).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(c.risk);
  });
});
