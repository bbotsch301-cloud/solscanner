/**
 * Reading the deed from the mint account itself, rather than from an indexer's summary of it.
 *
 * A deed issued by the platform is written into the mint as Token-2022 `additionalMetadata` — the
 * SPL token-metadata interface's arbitrary key/value pairs, stored in the account. That is the
 * primary source. `Collectible.attributes`, by contrast, comes from whatever DAS returned, and DAS
 * is a third party's reading of the chain: whether Helius maps `additionalMetadata` into
 * `content.metadata.attributes` is its choice, not the chain's, and the public-RPC fallback path in
 * `solana/collectibles.ts` populates no attributes at all.
 *
 * So this is not a fallback for a broken indexer. "The chain is the authority" applied to the deed
 * means the terms come from the account, and anything an indexer says about them is at best a cache.
 * Where the two disagree, the account wins here — see `mergeTraits`.
 *
 * One RPC call per asset, so it is deliberately NOT wired into the gallery, which renders dozens of
 * items at once. It runs on the detail screen, for the one asset being looked at, and the result is
 * remembered for the session.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getTokenMetadata } from "@solana/spl-token";
import { connection, CLUSTER } from "../solana/connection";
import { norm } from "../metadata/traits";
import { parseKind, type Collectible } from "../solana/collectibles";

export interface Trait {
  trait: string;
  value: string;
}

/**
 * What the chain says, per mint, for this session.
 *
 * Three states, and the third is why this is a Map of `Trait[] | null` rather than a Map that gets
 * deleted on failure: `undefined` means not looked up, `null` means looked up and there was nothing
 * there (a legacy Metaplex NFT, ordinary art, a token with no metadata extension). Without that
 * distinction every re-render of a deedless asset re-asks the RPC the same settled question.
 */
const cache = new Map<string, Trait[] | null>();

/**
 * Keyed by cluster as well as mint. The same address is a different account on devnet and mainnet,
 * and `CLUSTER` is a live binding that `setNetwork` reassigns under us — so scoping the key is what
 * keeps a switch from serving one network's deed for the other's asset, without this module having
 * to be told about network changes (which would mean connection.ts importing it back).
 */
const keyFor = (mint: string) => `${CLUSTER}:${mint}`;

/**
 * The deed traits written into the mint account, or null if it carries none.
 *
 * Never throws. An unreachable RPC is reported the same way as "no metadata", because from the
 * caller's side both mean "the chain told us nothing" — but it is NOT cached, so the next visit
 * asks again rather than remembering an outage as a fact about the asset.
 */
export async function fetchOnChainTraits(mint: string): Promise<Trait[] | null> {
  const cacheKey = keyFor(mint);
  const hit = cache.get(cacheKey);
  if (hit !== undefined) return hit;

  let key: PublicKey;
  try {
    key = new PublicKey(mint);
  } catch {
    return null; // not an address; nothing to look up, and nothing worth remembering
  }

  try {
    const meta = await getTokenMetadata(connection, key, "confirmed", TOKEN_2022_PROGRAM_ID);
    const pairs = meta?.additionalMetadata ?? [];
    const traits = pairs
      .filter(([k, v]) => k != null && v != null && String(k).trim() !== "")
      .map(([k, v]) => ({ trait: String(k), value: String(v) }));
    const result = traits.length ? traits : null;
    cache.set(cacheKey, result);
    return result;
  } catch {
    // Unreachable RPC, a non-Token-2022 mint, or an account the parser can't unpack. Not cached.
    return null;
  }
}

/**
 * Fold the chain's traits into the indexer's, with the chain winning any disagreement.
 *
 * Matching is on the normalised trait name — the same `norm` both `parseKind` and `parseDeed` use —
 * so an indexer's "creator_royalty" and the chain's "Creator Royalty" are recognised as one field
 * rather than both surviving and one of them being picked at random by whichever parse ran first.
 *
 * Order is preserved: on-chain traits first, in the order they were written, then whatever the
 * indexer had that the chain did not mention. `parseDeed` takes the first writer for a duplicate
 * key, so the ordering is what makes "the chain wins" true rather than merely intended.
 */
export function mergeTraits(indexed: Trait[] | undefined, onchain: Trait[] | null): Trait[] | undefined {
  if (!onchain?.length) return indexed;
  const seen = new Set(onchain.map((t) => norm(t.trait)));
  return [...onchain, ...(indexed ?? []).filter((t) => !seen.has(norm(t.trait)))];
}

/**
 * The same asset, with its deed read from the chain where the chain has one.
 *
 * Returns the item unchanged when there is nothing on-chain, so a caller can use the result
 * unconditionally — including for the great majority of assets that carry no deed at all.
 */
export async function withOnChainDeed(item: Collectible): Promise<Collectible> {
  const onchain = await fetchOnChainTraits(item.mint);
  if (!onchain?.length) return item;
  const attributes = mergeTraits(item.attributes, onchain);
  // The kind is read out of these same traits, and was decided at fetch time from what the indexer
  // had. If the chain is where `Type` was written, an asset that arrived as generic "art" is in fact
  // a book — so it is re-derived here rather than left disagreeing with its own deed.
  return { ...item, attributes, kind: parseKind(attributes) };
}
