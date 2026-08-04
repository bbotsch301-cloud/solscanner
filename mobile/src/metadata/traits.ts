/**
 * Reading metadata traits that issuers wrote by hand.
 *
 * Nobody agrees on how to spell a trait. "Creator Royalty", "creator_royalty" and "Royalty" are one
 * field; "Type", "type" and "Asset Type" all mean kind. Matching them exactly is how a perfectly
 * good deed reads as blank and a book shows up as generic art — silently, with nothing to tell the
 * member why.
 *
 * So both readers — `parseKind` in solana/collectibles.ts and `parseDeed` in property/deed.ts —
 * normalise through here rather than each rolling their own. They used to disagree: the deed parser
 * claimed to follow "the same tolerant spirit as parseKind" while actually being far more tolerant
 * than it.
 *
 * Lives in its own module because collectibles.ts and deed.ts point at each other — deed.ts reads a
 * Collectible's attributes — so neither can own the shared helper without a cycle.
 */

/** Casefold and strip the separators issuers vary on, so "Asset_Type" and "asset type" agree. */
export function norm(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, "");
}
