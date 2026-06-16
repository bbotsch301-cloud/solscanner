import { describe, expect, it } from "vitest";
import {
  FRESH_WALLET_DAYS,
  SNIPER_WINDOW_MIN,
  WHALE_SUPPLY_PCT,
  classifyAddress,
  isFresh,
  isSniper,
  isWhale,
} from "../analysis/heuristics";

const DAY = 86_400;
const NOW = 1_718_000_000;

describe("isFresh", () => {
  it("flags wallets first seen within the window", () => {
    expect(isFresh(NOW - 2 * DAY, NOW)).toBe(true);
    expect(isFresh(NOW - (FRESH_WALLET_DAYS + 1) * DAY, NOW)).toBe(false);
  });
  it("is false when firstSeen is unknown", () => {
    expect(isFresh(undefined, NOW)).toBe(false);
  });
});

describe("isWhale", () => {
  it("flags holdings above the supply threshold", () => {
    expect(isWhale(WHALE_SUPPLY_PCT + 0.001)).toBe(true);
    expect(isWhale(WHALE_SUPPLY_PCT)).toBe(false);
    expect(isWhale(undefined)).toBe(false);
  });
});

describe("isSniper", () => {
  const mint = NOW;
  it("flags buys inside the sniper window after mint creation", () => {
    expect(isSniper(mint + 60, mint)).toBe(true);
    expect(isSniper(mint + SNIPER_WINDOW_MIN * 60 + 1, mint)).toBe(false);
  });
  it("does not flag buys before mint creation or with missing data", () => {
    expect(isSniper(mint - 60, mint)).toBe(false);
    expect(isSniper(undefined, mint)).toBe(false);
    expect(isSniper(mint + 60, undefined)).toBe(false);
  });
});

describe("classifyAddress", () => {
  it("labels known CEX addresses", () => {
    const flags = classifyAddress({
      address: "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
      now: NOW,
    });
    expect(flags).toContain("cex");
  });

  it("labels known programs", () => {
    const flags = classifyAddress({
      address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
      now: NOW,
    });
    expect(flags).toContain("program");
  });

  it("combines data-driven flags", () => {
    const flags = classifyAddress({
      address: "Wha1eHo1der11111111111111111111111111111111",
      firstSeen: NOW - DAY,
      holdingPct: 0.04,
      firstBuyTs: NOW + 30,
      mintCreatedTs: NOW,
      now: NOW,
    });
    expect(flags).toEqual(expect.arrayContaining(["fresh", "whale", "sniper"]));
  });
});
