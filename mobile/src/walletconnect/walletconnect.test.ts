/**
 * The parts of WalletConnect that can be proven without a device, a camera or a relay.
 *
 * These were a standalone `node` script that re-declared the functions it was checking. That proves
 * the copy correct and says nothing about the code that ships — so `ourSignature` and the session
 * helpers were moved into `signature.ts` and `session.ts`, and this imports them.
 */
import { describe, expect, it } from "vitest";
import { Keypair, SystemProgram, Transaction, VersionedTransaction } from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { ourSignature } from "./signature";
import { sameAccount, sessionAccount } from "./session";

const BLOCKHASH = "11111111111111111111111111111111";

/**
 * A legacy transaction the wallet does NOT pay for, so it is not the first signer.
 *
 * Sponsored on purpose. The bug this guards against is assuming `signatures[0]`, and a single-signer
 * transaction puts the wallet at index 0 — so a one-signer test passes with the bug fully intact.
 * That is how it survived. Issuing a Key is exactly this shape: 2–N signatures with a mint keypair
 * co-signing.
 */
function sponsored(wallet: Keypair, sponsor: Keypair): VersionedTransaction {
  const tx = new Transaction();
  tx.feePayer = sponsor.publicKey;
  tx.recentBlockhash = BLOCKHASH;
  tx.add(
    SystemProgram.transfer({
      fromPubkey: wallet.publicKey,
      toPubkey: sponsor.publicKey,
      lamports: 1,
    }),
  );
  const bytes = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return VersionedTransaction.deserialize(Uint8Array.from(bytes));
}

describe("signature extraction", () => {
  const wallet = Keypair.generate();
  const sponsor = Keypair.generate();

  it("treats legacy bytes as a VersionedTransaction", () => {
    // Recorded because assuming otherwise is what produced an unreachable `catch` branch in
    // handlers.ts, with a legacy-specific fix inside it that could never run.
    expect(sponsored(wallet, sponsor).version).toBe("legacy");
  });

  it("returns this wallet's signature, not the fee payer's slot", () => {
    const tx = sponsored(wallet, sponsor);
    tx.sign([wallet]);
    const message = tx.message.serialize();
    const verifies = (sig: Uint8Array) => ed25519.verify(sig, message, wallet.publicKey.toBytes());

    expect(verifies(tx.signatures[0])).toBe(false); // the old assumption
    expect(verifies(ourSignature(tx, wallet))).toBe(true);
  });

  it("refuses an unfilled slot rather than returning 64 zero bytes", () => {
    // The silent failure this replaces: base58 encodes an empty slot as happily as a signature, so
    // the dApp accepts it and fails somewhere else entirely.
    const tx = sponsored(wallet, sponsor);
    tx.sign([wallet]);
    expect(tx.signatures[0].every((b) => b === 0)).toBe(true);
    expect(() => ourSignature(tx, sponsor)).toThrow(/missing/i);
  });

  it("refuses a wallet the transaction never asked to sign", () => {
    const tx = sponsored(wallet, sponsor);
    tx.sign([wallet]);
    expect(() => ourSignature(tx, Keypair.generate())).toThrow(/doesn't ask/i);
  });
});

describe("the account-switch guard", () => {
  const SOL_DEVNET = "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1";
  const A = Keypair.generate().publicKey.toBase58();
  const B = Keypair.generate().publicKey.toBase58();
  const EVM = "0xAbC0000000000000000000000000000000000001";

  const session = {
    namespaces: {
      solana: { accounts: [`${SOL_DEVNET}:${A}`] },
      eip155: { accounts: [`eip155:1:${EVM}`] },
    },
  };

  it("reads the address a session promised", () => {
    expect(sessionAccount(session, SOL_DEVNET)).toBe(A);
    expect(sessionAccount(session, "eip155:1")).toBe(EVM);
  });

  it("returns null for a chain the session never named", () => {
    expect(sessionAccount(session, "solana:some-other-genesis")).toBeNull();
    expect(sessionAccount(session, "eip155:56")).toBeNull();
    expect(sessionAccount(undefined, SOL_DEVNET)).toBeNull();
  });

  it("catches a switched account", () => {
    expect(sameAccount("solana", A, A)).toBe(true);
    expect(sameAccount("solana", A, B)).toBe(false);
  });

  it("compares Solana case-sensitively and EVM case-insensitively", () => {
    // Base58 carries case, so being lax there would call two DIFFERENT accounts one — the direction
    // that lets a request through it should refuse. EVM checksum casing is display-only, so being
    // strict there would call one account two.
    expect(sameAccount("solana", A, A.toLowerCase())).toBe(A === A.toLowerCase());
    expect(sameAccount("eip155", EVM, EVM.toLowerCase())).toBe(true);
  });
});
