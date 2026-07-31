import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchMarket, fetchMarkets } from "../dexscreener";

const ADDR = "0x1Ee8a2f28586e542af677eB15Fd00430f98d8fd8";

function mockPairs(pairs: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ pairs }),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("dexscreener", () => {
  it("picks the deepest-liquidity pair for the token", async () => {
    mockPairs([
      {
        chainId: "ethereum",
        url: "https://dex/shallow",
        priceUsd: "1.00",
        liquidity: { usd: 1_000 },
        baseToken: { address: ADDR, symbol: "SHALLOW", name: "Shallow" },
      },
      {
        chainId: "ethereum",
        url: "https://dex/deep",
        priceUsd: "2.00",
        marketCap: 5_000_000,
        priceChange: { h24: 12.5 },
        liquidity: { usd: 900_000 },
        baseToken: { address: ADDR, symbol: "DEEP", name: "Deep" },
        info: { imageUrl: "https://img/deep.png" },
      },
    ]);

    const m = await fetchMarket(ADDR);
    expect(m?.symbol).toBe("DEEP");
    expect(m?.priceUsd).toBe(2);
    expect(m?.change24h).toBe(12.5);
    expect(m?.marketCap).toBe(5_000_000);
    expect(m?.imageUrl).toBe("https://img/deep.png");
  });

  it("ignores pairs whose base token is a different address", async () => {
    mockPairs([
      {
        chainId: "ethereum",
        priceUsd: "9.99",
        liquidity: { usd: 5_000_000 },
        baseToken: { address: "0xdifferent", symbol: "OTHER", name: "Other" },
      },
    ]);
    expect(await fetchMarket(ADDR)).toBeNull();
  });

  it("keys results by lowercased address and fails soft on non-ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
    );
    const map = await fetchMarkets([ADDR]);
    expect(map).toEqual({});
  });
});
