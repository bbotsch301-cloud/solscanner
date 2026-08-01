import { describe, it, expect } from "vitest";
import { SHOWCASE, chainOf, findShowcase } from "../showcase";

describe("showcase", () => {
  it("infers chain from address prefix", () => {
    expect(chainOf("0x1Ee8a2f28586e542af677eB15Fd00430f98d8fd8")).toBe("evm");
    expect(chainOf("22WntfxTZcEoSeGPdfkcZ29QdKHowY8ahgcKaDHMpump")).toBe("solana");
  });

  it("has no duplicate addresses (case-insensitive)", () => {
    const keys = SHOWCASE.map((t) => t.address.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("finds tokens case-insensitively", () => {
    const found = findShowcase("0x1ee8a2f28586e542af677eb15fd00430f98d8fd8");
    expect(found?.name).toBe("BTC Dragon");
    expect(findShowcase("not-a-real-address")).toBeUndefined();
  });

  it("every entry has an address, and a non-empty name when one is set", () => {
    for (const t of SHOWCASE) {
      expect(t.address.length).toBeGreaterThan(0);
      if (t.name !== undefined) expect(t.name.length).toBeGreaterThan(0);
    }
  });
});
