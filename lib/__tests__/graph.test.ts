import { describe, expect, it } from "vitest";
import { buildGraph, mergeGraphs } from "../analysis/graph";
import type { Transfer } from "../chains/types";
import transfers from "../../data/fixtures/transfers.json";

const CENTER = "CenterWa11et11111111111111111111111111111111";

describe("buildGraph", () => {
  const graph = buildGraph(transfers as Transfer[], { center: CENTER });

  it("includes the center node and marks it", () => {
    const center = graph.nodes.find((n) => n.id === CENTER);
    expect(center?.center).toBe(true);
  });

  it("only keeps edges that touch the center (one hop)", () => {
    for (const link of graph.links) {
      expect(link.source === CENTER || link.target === CENTER).toBe(true);
    }
  });

  it("labels known neighbors (CEX/program)", () => {
    const binance = graph.nodes.find(
      (n) => n.id === "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S"
    );
    expect(binance?.flags).toContain("cex");
    const pump = graph.nodes.find(
      (n) => n.id === "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
    );
    expect(pump?.flags).toContain("program");
  });

  it("applies whale flag from nodeMeta", () => {
    const g = buildGraph(transfers as Transfer[], {
      center: CENTER,
      nodeMeta: {
        "Wha1eHo1der11111111111111111111111111111111": { holdingPct: 0.04 },
      },
    });
    const whale = g.nodes.find(
      (n) => n.id === "Wha1eHo1der11111111111111111111111111111111"
    );
    expect(whale?.flags).toContain("whale");
  });

  it("caps fan-out to maxFanout neighbors", () => {
    const g = buildGraph(transfers as Transfer[], { center: CENTER, maxFanout: 1 });
    // center + 1 neighbor
    expect(g.nodes.length).toBe(2);
  });
});

describe("mergeGraphs", () => {
  it("de-duplicates nodes and links across hops", () => {
    const a = buildGraph(transfers as Transfer[], { center: CENTER });
    const b = buildGraph(transfers as Transfer[], {
      center: "Norma1Wa11et1111111111111111111111111111111",
    });
    const merged = mergeGraphs(a, b);
    const ids = merged.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
