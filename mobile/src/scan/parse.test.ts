/**
 * What the scanner decides a code is.
 *
 * The camera can't be exercised without a device — but nothing is decided there, so every branch is
 * reachable from here and from the screen's paste field. That split is the reason this module exists
 * separately from the screen.
 *
 * The near-misses matter as much as the hits. A string that *looks* like a pairing URI but carries no
 * key, an address with a typo, a URL from a poster — each has to land somewhere sensible rather than
 * being force-fit into whichever branch it hits first.
 */
import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { describeUnknown, parseScan } from "./parse";

const SOL = Keypair.generate().publicKey.toBase58();
const EVM = "0xAbC0000000000000000000000000000000000001";
const PAIRING =
  "wc:7f6e5d4c3b2a1908f7e6d5c4b3a29180@2?relay-protocol=irn&symKey=deadbeefcafe0123456789abcdef";

describe("WalletConnect", () => {
  it("recognises a pairing URI and the deep-link wrapper", () => {
    expect(parseScan(PAIRING)).toEqual({ kind: "walletconnect", uri: PAIRING });
    expect(parseScan(`xgowallet://wc?uri=${encodeURIComponent(PAIRING)}`)).toEqual({
      kind: "walletconnect",
      uri: PAIRING,
    });
  });

  it("does not accept a wc: link with no key", () => {
    // Starting with wc: is not enough — pairing needs the symmetric key, and handing WalletKit
    // something without one fails far from its cause. It must fall through to unknown, and the
    // message must say the link is incomplete rather than that it wasn't a link at all.
    const r = parseScan("wc:justatopic@2");
    expect(r.kind).toBe("unknown");
    expect(describeUnknown((r as { saw: string }).saw)).toMatch(/incomplete/i);
  });
});

describe("bare addresses", () => {
  it("recognises Solana and EVM", () => {
    expect(parseScan(SOL)).toEqual({ kind: "address", chain: "solana", address: SOL });
    expect(parseScan(EVM)).toEqual({ kind: "address", chain: "evm", address: EVM });
  });

  it("accepts an EVM address in any checksum case", () => {
    expect(parseScan(EVM.toLowerCase())).toMatchObject({ chain: "evm" });
  });

  it("carries no amount — a bare address never implies one", () => {
    expect(parseScan(SOL)).not.toHaveProperty("amount");
  });

  it("tolerates surrounding whitespace", () => {
    expect(parseScan(`  ${SOL}\n`)).toMatchObject({ address: SOL });
  });
});

describe("payment URIs", () => {
  it("reads Solana Pay, with and without an amount", () => {
    expect(parseScan(`solana:${SOL}?amount=1.5&spl-token=${SOL}`)).toEqual({
      kind: "address",
      chain: "solana",
      address: SOL,
      amount: "1.5",
      token: SOL,
    });
    expect(parseScan(`solana:${SOL}`)).toEqual({ kind: "address", chain: "solana", address: SOL });
  });

  it("reads EIP-681 and ignores the chain id it names", () => {
    // The send happens on whichever EVM chain the wallet is on. Switching chains because of what a
    // camera saw, immediately before moving funds, is not a decision to make on someone's behalf.
    expect(parseScan(`ethereum:${EVM}@1?value=1000`)).toEqual({
      kind: "address",
      chain: "evm",
      address: EVM,
      amount: "1000",
    });
  });

  it("refuses a scheme whose address is for the other chain", () => {
    // `solana:0x…` is not a thing. Trusting the scheme over the address would send funds using a
    // chain the address doesn't belong to.
    expect(parseScan(`solana:${EVM}`).kind).toBe("unknown");
    expect(parseScan(`ethereum:${SOL}`).kind).toBe("unknown");
  });

  it("refuses a scheme with nothing after it", () => {
    expect(parseScan("solana:").kind).toBe("unknown");
    expect(parseScan("ethereum:").kind).toBe("unknown");
  });
});

describe("everything else", () => {
  it("lands in unknown rather than being force-fit", () => {
    for (const s of ["", "   ", "https://example.com", "hello world", "0xnope", `${SOL}X`]) {
      expect(parseScan(s).kind, s).toBe("unknown");
    }
  });

  it("truncates what it echoes back", () => {
    const long = "https://example.com/" + "a".repeat(500);
    const r = parseScan(long) as { saw: string };
    expect(r.saw.length).toBeLessThan(70);
    expect(r.saw.endsWith("…")).toBe(true);
  });

  it("describes what it saw instead of one flat refusal", () => {
    // The whole point: "Paste or scan a link that starts with wc:" for every failure is what sent
    // someone to point the camera at their other wallet and learn nothing from the answer.
    const web = describeUnknown("https://example.com");
    const junk = describeUnknown("hello world");
    expect(web).toMatch(/web address/i);
    expect(junk).toMatch(/wallet address/i);
    expect(web).not.toBe(junk);
  });
});
