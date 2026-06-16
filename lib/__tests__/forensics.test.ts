import { describe, expect, it } from "vitest";
import { concentration, firstInboundFunding } from "../analysis/forensics";
import type { Holder, Transfer } from "../chains/types";

const h = (owner: string, pct: number): Holder => ({
  owner,
  amount: pct * 1000,
  rawAmount: String(pct * 1000),
  pct,
});

describe("concentration", () => {
  it("flags high concentration when top 10 exceed the threshold", () => {
    const c = concentration([h("a", 0.5), h("b", 0.2), h("c", 0.05)]);
    expect(c.top1Pct).toBe(0.5);
    expect(c.top10Pct).toBeCloseTo(0.75);
    expect(c.risk).toBe("high");
  });

  it("reports low risk for a well-distributed token", () => {
    const holders = Array.from({ length: 20 }, (_, i) => h(`a${i}`, 0.01));
    const c = concentration(holders);
    expect(c.holderCount).toBe(20);
    expect(c.risk).toBe("low");
  });
});

describe("firstInboundFunding", () => {
  const transfers: Transfer[] = [
    { signature: "s1", timestamp: 200, source: "X", destination: "W", mint: "SOL", amount: 1 },
    { signature: "s2", timestamp: 100, source: "FUNDER", destination: "W", mint: "SOL", amount: 5 },
    { signature: "s3", timestamp: 50, source: "W", destination: "Y", mint: "SOL", amount: 2 },
  ];

  it("returns the earliest inbound transfer", () => {
    const f = firstInboundFunding(transfers, "W");
    expect(f?.source).toBe("FUNDER");
    expect(f?.timestamp).toBe(100);
  });

  it("returns undefined when there is no inbound transfer", () => {
    expect(firstInboundFunding(transfers, "Z")).toBeUndefined();
  });
});
