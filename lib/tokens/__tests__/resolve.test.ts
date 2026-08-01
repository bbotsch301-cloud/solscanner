import { describe, it, expect, vi, afterEach } from "vitest";

// Stub the Solana on-chain fallback so these stay offline & deterministic; we test the
// merge precedence (override > dexscreener > jupiter) and the fallback behaviour.
vi.mock("@solana/web3.js", () => ({
  Connection: class {
    async getAccountInfo() {
      return null;
    }
  },
  PublicKey: class {
    static findProgramAddressSync() {
      return [new (class {})()];
    }
    toBuffer() {
      return Buffer.alloc(32);
    }
  },
}));

import { resolveToken } from "../resolve";

const GIRAFFE = "4r4Z6oodFM5VnVgdC8bfVj75UrrFv2vb2ShcuPjRpump";

function mockFetch(handlers: (url: string) => unknown | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const body = handlers(url);
      return { ok: body != null, json: async () => body };
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("resolveToken", () => {
  it("falls back to Jupiter for name/symbol/logo when DexScreener has nothing", async () => {
    mockFetch((url) => {
      if (url.includes("dexscreener")) return { pairs: [] };
      if (url.includes("tokens.jup.ag"))
        return { name: "Giraffe Coin", symbol: "GIRAFFE", logoURI: "https://img/giraffe.png" };
      return null;
    });
    const v = await resolveToken({ address: GIRAFFE });
    expect(v.name).toBe("Giraffe Coin");
    expect(v.symbol).toBe("GIRAFFE");
    expect(v.logo).toBe("https://img/giraffe.png");
  });

  it("a manual override wins over DexScreener and Jupiter", async () => {
    mockFetch((url) => {
      if (url.includes("dexscreener"))
        return {
          pairs: [
            {
              chainId: "solana",
              priceUsd: "1.5",
              liquidity: { usd: 1000 },
              baseToken: { address: GIRAFFE, name: "DexName", symbol: "DEX" },
              info: { imageUrl: "https://dex/logo.png" },
            },
          ],
        };
      if (url.includes("tokens.jup.ag")) return { name: "JupName", symbol: "JUP", logoURI: "https://jup.png" };
      return null;
    });
    const v = await resolveToken({
      address: GIRAFFE,
      name: "Giraffe Coin",
      symbol: "GIRAF",
      logo: "/tokens/giraffe.png",
    });
    expect(v.name).toBe("Giraffe Coin");
    expect(v.symbol).toBe("GIRAF");
    expect(v.logo).toBe("/tokens/giraffe.png");
    expect(v.priceUsd).toBe(1.5); // price still comes from DexScreener
  });

  it("degrades to a short address + no logo when every source is empty", async () => {
    mockFetch((url) => {
      if (url.includes("dexscreener")) return { pairs: [] };
      return null; // jupiter 404s
    });
    const v = await resolveToken({ address: GIRAFFE });
    expect(v.logo).toBeNull();
    expect(v.symbol).toBeNull();
    expect(v.name).toContain("…"); // shortened address
  });
});
