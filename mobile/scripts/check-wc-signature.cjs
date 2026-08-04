/**
 * Proof that the WalletConnect signature extraction returns THIS wallet's signature.
 *
 *   node scripts/check-wc-signature.cjs
 *
 * There is no test runner in this project, and this is the one piece of WalletConnect that can be
 * checked without a device, a camera or a relay — so it is checked here rather than asserted in a
 * commit message.
 *
 * ## Why a SPONSORED transaction
 *
 * The bug being guarded against is `signatures[0]`, i.e. assuming the wallet is the fee payer. A
 * single-signer test passes with that bug fully intact, because there index 0 *is* the wallet. It
 * took a co-signed transaction to see it, and issuing a Key — 2–N signatures with a mint keypair
 * co-signing — is exactly that shape. So this builds a transaction where the wallet is deliberately
 * the second signer.
 *
 * ## The four facts
 *
 *   1. `VersionedTransaction.deserialize` accepts LEGACY bytes. Recorded because assuming otherwise
 *      is what produced an unreachable `catch` branch, and a legacy-specific fix inside it that
 *      could never run.
 *   2. `signatures[0]` does NOT verify against the wallet on a sponsored transaction.
 *   3. The index lookup DOES verify.
 *   4. An unfilled slot is all-zero, so it must be refused rather than base58-encoded and returned.
 */
const path = require("node:path");

const req = (m) => require(path.join(__dirname, "..", "node_modules", m));
const { Keypair, Transaction, SystemProgram, VersionedTransaction } = req("@solana/web3.js");
const { ed25519 } = req("@noble/curves/ed25519");

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `  (got ${actual}, want ${expected})`}`);
}

/** The function under test, mirroring `src/walletconnect/handlers.ts`. */
function ourSignature(tx, keypair) {
  const keys = tx.message.getAccountKeys().staticAccountKeys;
  const idx = keys
    .slice(0, tx.message.header.numRequiredSignatures)
    .findIndex((k) => k.equals(keypair.publicKey));
  if (idx < 0) throw new Error("This transaction doesn't ask for this wallet's signature.");
  const sig = tx.signatures[idx];
  if (!sig || sig.every((b) => b === 0))
    throw new Error("The wallet's signature is missing from the signed transaction.");
  return sig;
}

const wallet = Keypair.generate();
const sponsor = Keypair.generate();

// Legacy — every transaction the Goshen web app produces is `new Transaction(...)`.
// Fee payer is the sponsor, so the wallet is NOT index 0.
const legacy = new Transaction();
legacy.feePayer = sponsor.publicKey;
legacy.recentBlockhash = "11111111111111111111111111111111";
legacy.add(
  SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: sponsor.publicKey, lamports: 1 }),
);
const bytes = legacy.serialize({ requireAllSignatures: false, verifySignatures: false });

console.log("\nWalletConnect signature extraction\n");

// 1 — legacy bytes deserialize as a VersionedTransaction.
const tx = VersionedTransaction.deserialize(Uint8Array.from(bytes));
check("legacy bytes deserialize as VersionedTransaction", tx.version, "legacy");

tx.sign([wallet]);

const keys = tx.message.getAccountKeys().staticAccountKeys;
const idx = keys
  .slice(0, tx.message.header.numRequiredSignatures)
  .findIndex((k) => k.equals(wallet.publicKey));
check("the wallet is not the fee payer", idx > 0, true);

const message = tx.message.serialize();
const verifies = (sig) => {
  try {
    return ed25519.verify(sig, message, wallet.publicKey.toBytes());
  } catch {
    return false;
  }
};

// 2 and 3 — the old assumption fails, the lookup succeeds.
check("signatures[0] does NOT verify as the wallet", verifies(tx.signatures[0]), false);
check("ourSignature() verifies as the wallet", verifies(ourSignature(tx, wallet)), true);

// 4 — the empty slot the old code would have returned.
check("the fee payer's slot is all-zero", tx.signatures[0].every((b) => b === 0), true);

const stranger = Keypair.generate();
let refused = false;
try {
  ourSignature(tx, stranger);
} catch {
  refused = true;
}
check("a wallet that isn't a required signer is refused", refused, true);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
