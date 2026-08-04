import { describe, expect, it } from "vitest";
import { wcUriFrom } from "./deeplink";

const PAIRING =
  "wc:7f6e5d4c3b2a1908f7e6d5c4b3a29180@2?relay-protocol=irn&symKey=deadbeefcafe0123456789abcdef";

describe("wcUriFrom", () => {
  it("takes a bare pairing URI as-is", () => {
    expect(wcUriFrom(PAIRING)).toBe(PAIRING);
    expect(wcUriFrom(`  ${PAIRING}  `)).toBe(PAIRING);
  });

  it("unwraps the conventional deep link", () => {
    expect(wcUriFrom(`xgowallet://wc?uri=${encodeURIComponent(PAIRING)}`)).toBe(PAIRING);
  });

  it("recovers a pairing URI that was embedded without encoding", () => {
    // Its own `&symKey=...` reads as a second parameter of the outer link, so a query parser
    // truncates it at the first `&` and hands back something that would pair and then fail.
    const sloppy = `xgowallet://wc?uri=${PAIRING}`;
    expect(new URLSearchParams(sloppy.slice(sloppy.indexOf("?") + 1)).get("uri")).not.toBe(PAIRING);
    expect(wcUriFrom(sloppy)).toBe(PAIRING);
  });

  it("ignores links that have nothing to do with WalletConnect", () => {
    for (const url of [
      null,
      undefined,
      "",
      "   ",
      "https://example.com",
      "xgowallet://",
      "xgowallet://settings",
      "xgowallet://wc",
      "xgowallet://wc?other=1",
      "mailto:someone@example.com",
    ]) {
      expect(wcUriFrom(url)).toBeNull();
    }
  });

  it("refuses a `wc:` link that isn't a pairing URI", () => {
    // Starting with `wc:` is not enough — pairing needs the symmetric key, and handing WalletKit
    // something without one produces a failure far from its cause.
    expect(wcUriFrom("wc:justatopic@2")).toBeNull();
    expect(wcUriFrom("wc:")).toBeNull();
    expect(wcUriFrom("xgowallet://wc?uri=wc:justatopic@2")).toBeNull();
  });
});
