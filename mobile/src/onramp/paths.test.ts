/**
 * The boundary, asserted.
 *
 * Most of this file tests copy, which is unusual — but the copy IS the feature here. "We only
 * facilitate" is a claim about what the app does, and the ways it stops being true are all small
 * edits that look harmless in a diff: a referral parameter on a link, an address prefilled into a
 * provider's URL, a list quietly re-ordered so the best-paying name is first, a disclaimer trimmed
 * because it made the screen long.
 *
 * Each of those is caught below. The rest is ordinary: the right steps for the right kind of
 * purchase, and the network label a member has to get right or lose the money.
 */
import { describe, expect, it } from "vitest";
import {
  FACILITATION,
  PROVIDERS,
  WITHDRAWAL_NETWORK,
  buySteps,
  fundingPaths,
  isNeutralUrl,
  type FundingContext,
} from "./paths";

const SOL: FundingContext = {
  chainId: "solana",
  chainName: "Solana",
  symbol: "SOL",
  testNetwork: false,
};
const DEVNET: FundingContext = { ...SOL, testNetwork: true };
const ETH: FundingContext = {
  chainId: "ethereum",
  chainName: "Ethereum",
  symbol: "ETH",
  testNetwork: false,
};

describe("staying out of the transaction", () => {
  it("links to bare origins — no query, no path, no fragment", () => {
    // The mechanical form of the whole posture. A referral code, an affiliate id, a prefilled
    // address and a preselected amount are all query strings, so none of them can be added to a
    // provider link without this failing.
    for (const p of PROVIDERS) expect(isNeutralUrl(p.url), p.name).toBe(true);
  });

  it("rejects the shapes that would put us in the flow of funds", () => {
    expect(isNeutralUrl("https://www.moonpay.com/?ref=xgo")).toBe(false);
    expect(isNeutralUrl("https://www.moonpay.com/buy?walletAddress=abc")).toBe(false);
    expect(isNeutralUrl("https://buy.example.com/#/checkout")).toBe(false);
    expect(isNeutralUrl("http://www.coinbase.com/")).toBe(false);
    expect(isNeutralUrl("https://user:pass@example.com/")).toBe(false);
  });

  it("lists providers alphabetically, so the order can't become a ranking", () => {
    const names = PROVIDERS.map((p) => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("offers both kinds, because they are different purchases", () => {
    // An exchange leaves the coins with the exchange until you withdraw them; an on-ramp sends
    // straight to your address. Collapsing the two would make one of the two walkthroughs wrong.
    expect(PROVIDERS.some((p) => p.kind === "exchange")).toBe(true);
    expect(PROVIDERS.some((p) => p.kind === "onramp")).toBe(true);
  });

  it("states the four things that matter, and keeps stating them", () => {
    const all = FACILITATION.full.join(" ").toLowerCase();
    expect(all).toMatch(/no fee and no commission/); // we are not paid
    expect(all).toMatch(/we receive nothing/); // nor paid by them
    expect(all).toMatch(/cannot reverse it, refund it or recover it/); // nothing can be undone
    expect(all).toMatch(/none of this is financial advice/); // and none of it is advice
    expect(FACILITATION.short.toLowerCase()).toMatch(/doesn't sell crypto/);
  });
});

describe("the ways in", () => {
  it("leads with the path that needs nobody", () => {
    const [first, ...rest] = fundingPaths(SOL);
    expect(first.id).toBe("receive");
    expect(first.thirdParty).toBe(false);
    expect(rest.map((p) => p.id)).toEqual(["buy"]);
    expect(rest[0].thirdParty).toBe(true);
  });

  it("offers no purchase on the test network", () => {
    // Devnet SOL is printed on request and worth nothing. Offering to sell it — or to sell real
    // coins onto a wallet showing a network where they won't appear — would be selling nothing.
    const ids = fundingPaths(DEVNET).map((p) => p.id);
    expect(ids).toContain("faucet");
    expect(ids).not.toContain("buy");
    expect(ids[0]).toBe("faucet");
  });

  it("says outright that test coins aren't real", () => {
    const faucet = fundingPaths(DEVNET)[0];
    expect(`${faucet.title} ${faucet.blurb}`.toLowerCase()).toMatch(/not real|no value/);
  });

  it("names the chain it's talking about", () => {
    expect(fundingPaths(ETH)[0].blurb).toContain("Ethereum");
    expect(fundingPaths(ETH)[0].blurb).toContain("ETH");
  });
});

describe("the walkthrough", () => {
  it("starts by copying the address, whichever route", () => {
    for (const via of ["exchange", "onramp"] as const) {
      expect(buySteps(SOL, via)[0].title.toLowerCase(), via).toContain("copy your");
    }
  });

  it("has an exchange withdraw, and names the network to withdraw over", () => {
    const steps = buySteps(SOL, "exchange");
    const withdraw = steps.find((s) => /withdraw to your address/i.test(s.title));
    expect(withdraw).toBeDefined();
    expect(withdraw?.title).toContain(WITHDRAWAL_NETWORK.solana);
  });

  it("warns about the wrong network, exactly once, and only on the exchange route", () => {
    // The unrecoverable mistake. An on-ramp sends straight to the address it was given, so there is
    // no network menu to get wrong — the warning belongs to the route that has one.
    expect(buySteps(SOL, "exchange").filter((s) => s.warn)).toHaveLength(1);
    expect(buySteps(SOL, "onramp").filter((s) => s.warn)).toHaveLength(0);
  });

  it("has no withdrawal step on the on-ramp route, because there is no withdrawal", () => {
    const steps = buySteps(SOL, "onramp");
    expect(steps.some((s) => /withdraw/i.test(s.title))).toBe(false);
    expect(steps.some((s) => /paste your address/i.test(s.title))).toBe(true);
  });

  it("uses the label each chain's exchanges actually show", () => {
    expect(buySteps(ETH, "exchange").some((s) => s.title.includes("ERC-20"))).toBe(true);
    expect(WITHDRAWAL_NETWORK.bsc).toContain("BEP-20");
    // Three chains, three distinct labels — a duplicate would be telling someone to pick a network
    // their address doesn't exist on.
    expect(new Set(Object.values(WITHDRAWAL_NETWORK)).size).toBe(
      Object.keys(WITHDRAWAL_NETWORK).length,
    );
  });

  it("ends by saying the app does nothing further", () => {
    for (const via of ["exchange", "onramp"] as const) {
      const last = buySteps(SOL, via).at(-1);
      expect(`${last?.title} ${last?.detail}`.toLowerCase(), via).toMatch(/arriv|nothing more/);
    }
  });
});
