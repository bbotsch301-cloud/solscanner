/**
 * Whether this item can actually be sent — asked of the chain, before the member taps anything.
 *
 * `Collectible.transferable` is a hint from the indexer: it means "not compressed and not a
 * programmable NFT", which is the only thing DAS tells us. It does not mean the token program will
 * accept a transfer. A Token-2022 mint carrying the `NonTransferable` extension is refused by the
 * program itself, and nothing in the DAS response says so — the public-RPC fallback path doesn't
 * even try, it hardcodes `transferable: true` for everything it finds.
 *
 * That gap became a real one the moment the platform started issuing keys. Identity, Community and
 * Credential keys are minted non-transferable on purpose (canonical §6: non-transferability is a
 * technical property or it is decoration), so without this the wallet offers Send on a key that
 * cannot move, takes the member through a recipient and a confirmation, and lets the chain deliver
 * the refusal.
 *
 * Same shape and same reasoning as `burnPreflight` next door: refuse UP FRONT with a reason, and
 * never let "we couldn't check" masquerade as "you can't". Those are opposite things to tell someone
 * about their own property.
 */
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getNonTransferable,
  unpackMint,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { connection, CLUSTER } from "./connection";
import type { Collectible } from "./collectibles";

export type SendBlocker = "non-transferable" | "compressed" | "programmable" | "frozen" | "not-held" | "unreadable";

export interface SendPlan {
  /** null when the item can be sent. */
  blocked: SendBlocker | null;
  /** Human-readable reason when blocked. */
  reason?: string;
}

/**
 * Plain-language refusals.
 *
 * `non-transferable` deliberately describes a mechanism rather than a rule: the member should
 * understand this is the chain refusing, not the app declining. The deed's own resale term produces
 * a different message entirely, in CollectibleDetailScreen, and the two must not be collapsed — one
 * is a fact about the token and the other is an agreement the app is choosing to honour.
 */
const REASONS: Record<SendBlocker, string> = {
  "non-transferable":
    "This key was minted so it can't be transferred — the token program itself refuses it, which is what makes it genuinely yours alone. That was set when it was issued and can never be changed.",
  compressed:
    "This is a compressed NFT. Sending one needs the Bubblegum program and a proof from the indexer, which this wallet doesn't do yet.",
  programmable:
    "This is a programmable NFT. Its rule set decides transfers, and this wallet can't satisfy one yet.",
  frozen:
    "This token has been frozen by its issuer, which blocks transfers. Nothing can be done with it on-chain.",
  "not-held": "This item isn't in your wallet any more, so there's nothing to send.",
  unreadable: "Couldn't read this token's account just now, so there's no safe way to tell whether it can be sent.",
};

/**
 * Non-transferability, cached forever per (cluster, mint).
 *
 * It is set at mint time and can never be added or removed afterwards, so unlike almost everything
 * else the wallet reads from the chain, this answer cannot go stale. Cluster-keyed because the same
 * address is a different account on devnet and mainnet, and `CLUSTER` is a live binding `setNetwork`
 * reassigns under us.
 *
 * A failed read is NOT cached — an unreachable RPC must not be remembered as a fact about the asset.
 */
interface MintFacts {
  programId: PublicKey;
  nonTransferable: boolean;
}
const mintCache = new Map<string, MintFacts>();

/**
 * Both permanent facts about a mint, from one account read.
 *
 * The owning program and the NonTransferable extension are fixed at creation, so this is cached
 * together — and it means the preflight below costs one round trip for the mint rather than the two
 * it would take to ask these separately.
 */
async function readMint(mint: PublicKey): Promise<MintFacts | "unknown"> {
  const key = `${CLUSTER}:${mint.toBase58()}`;
  const hit = mintCache.get(key);
  if (hit !== undefined) return hit;

  try {
    const info = await connection.getAccountInfo(mint, "confirmed");
    if (!info) return "unknown";
    // Only Token-2022 has extensions at all; a legacy mint is transferable as far as the program
    // is concerned, and that answer is as permanent as the other one.
    if (!info.owner.equals(TOKEN_2022_PROGRAM_ID)) {
      const facts: MintFacts = { programId: TOKEN_PROGRAM_ID, nonTransferable: false };
      mintCache.set(key, facts);
      return facts;
    }
    const mintState = unpackMint(mint, info, TOKEN_2022_PROGRAM_ID);
    const facts: MintFacts = {
      programId: TOKEN_2022_PROGRAM_ID,
      nonTransferable: getNonTransferable(mintState) !== null,
    };
    mintCache.set(key, facts);
    return facts;
  } catch {
    return "unknown";
  }
}

/**
 * Decide whether `item` can be sent. Never throws — a failure to read is a refusal to say yes,
 * which is not the same as saying no, and the caller renders it as such.
 */
export async function sendPreflight(item: Collectible, owner: string): Promise<SendPlan> {
  // The two the indexer already answered. No point in a round trip for either.
  if (item.compressed) return { blocked: "compressed", reason: REASONS.compressed };

  let mintPk: PublicKey;
  let ownerPk: PublicKey;
  try {
    mintPk = new PublicKey(item.mint);
    ownerPk = new PublicKey(owner);
  } catch {
    return { blocked: "unreadable", reason: REASONS.unreadable };
  }

  const facts = await readMint(mintPk);
  if (facts === "unknown") return { blocked: "unreadable", reason: REASONS.unreadable };
  if (facts.nonTransferable) return { blocked: "non-transferable", reason: REASONS["non-transferable"] };

  // A frozen account blocks transfer the same way it blocks burning, and the member would rather
  // learn that here than from a failed transaction. Same read `burnPreflight` does.
  try {
    const ata = getAssociatedTokenAddressSync(mintPk, ownerPk, false, facts.programId);
    const parsed = await connection.getParsedAccountInfo(ata);
    const val = parsed.value;
    if (!val) return { blocked: "not-held", reason: REASONS["not-held"] };

    const acct = (val.data as { parsed?: { info?: { state?: string; tokenAmount?: { amount?: string } } } })?.parsed
      ?.info;
    if (!acct) return { blocked: "unreadable", reason: REASONS.unreadable };
    if (acct.state === "frozen") return { blocked: "frozen", reason: REASONS.frozen };
    if ((acct.tokenAmount?.amount ?? "0") === "0") return { blocked: "not-held", reason: REASONS["not-held"] };
  } catch {
    return { blocked: "unreadable", reason: REASONS.unreadable };
  }

  // Left until last on purpose: it's the indexer's word rather than the chain's, so anything the
  // chain could answer gets asked first.
  if (!item.transferable) return { blocked: "programmable", reason: REASONS.programmable };

  return { blocked: null };
}
