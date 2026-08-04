/**
 * Pulling this wallet's signature out of a transaction it just signed.
 *
 * Split out of `handlers.ts` so a test can exercise the real function. It lived there behind imports
 * that reach into the EVM stack and the Solana connection, which a node test cannot load — so the
 * check that existed for it tested a hand-copied duplicate instead. A copy proves the copy correct.
 * Nothing here imports anything but `@solana/web3.js`.
 */
import type { Keypair, VersionedTransaction } from "@solana/web3.js";

/**
 * The signature THIS wallet just added — found by looking for it, not by assuming where it is.
 *
 * `VersionedTransaction.signatures` is `Uint8Array[]`, index-aligned to the required signers. Index 0
 * is the FEE PAYER, which is not always us. When it isn't, that slot is still 64 unfilled zero bytes,
 * and base58 encodes those as happily as a real signature — so returning `signatures[0]` handed the
 * dApp a valid-looking, entirely empty signature and said nothing.
 *
 * The case where this bites is not exotic, it is the flagship one: **issuing a Key** is 2–N
 * signatures over one session with a mint keypair co-signing, so the wallet routinely lands at index
 * 1 or later. A single-signer test passes with this bug fully intact, which is how it survived.
 *
 * `staticAccountKeys` is the right list and needs no address-lookup-table resolution: lookup tables
 * cannot supply signers, so every required signer is always static.
 */
export function ourSignature(tx: VersionedTransaction, keypair: Keypair): Uint8Array {
  const keys = tx.message.getAccountKeys().staticAccountKeys;
  const idx = keys
    .slice(0, tx.message.header.numRequiredSignatures)
    .findIndex((k) => k.equals(keypair.publicKey));
  if (idx < 0) throw new Error("This transaction doesn't ask for this wallet's signature.");

  const sig = tx.signatures[idx];
  // An unfilled slot is all zeroes. Refusing it is the whole point — a silently empty signature is
  // worse than a failed request, because the dApp accepts it and fails somewhere else entirely.
  if (!sig || sig.every((b) => b === 0))
    throw new Error("The wallet's signature is missing from the signed transaction.");
  return sig;
}
