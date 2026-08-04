/**
 * The Property Deed — the agreement attached to a piece of digital property, read from the asset's
 * own metadata.
 *
 * "Keys represent rights. Agreements define them. Ownership is on-chain." Until now the wallet
 * rendered those rights as an anonymous row of trait chips: the deed was sitting in the metadata we
 * already fetch and we showed it as unlabelled key/value pairs. This parses it.
 *
 * Deliberately on-chain-only: no server, and nothing to trust but the asset itself.
 *
 * The terms come from `Collectible.attributes`, and where those come from is worth being exact
 * about, because this comment used to claim both fetch paths in solana/collectibles.ts populate
 * them and only one does. The DAS path populates attributes from the indexer. The public-RPC
 * fallback populates NONE — an asset resolved that way parses to a null deed, not a partial one.
 * And whether an indexer maps Token-2022 `additionalMetadata` into its attributes at all is the
 * indexer's choice.
 *
 * So `property/onchainDeed.ts` reads the deed from the mint account directly and merges it in ahead
 * of anything the indexer said. That is the authoritative path; this parser is the same either way,
 * because both hand it the same shape.
 *
 * Issuers write these by hand, so every rule below is deliberately tolerant about spelling and
 * shape — but never about certainty. See `bool()` for the part that matters most.
 */
import type { Collectible } from "../solana/collectibles";
import { norm } from "../metadata/traits";

/** The rights a deed can grant or withhold. */
export type RightKey =
  | "personalUse"
  | "download"
  | "retainedCopy"
  | "vaultStorage"
  | "updates"
  | "resell"
  | "commercial"
  | "printing";

/** Display order — the order the deed card reads in, not alphabetical. */
export const RIGHT_ORDER: RightKey[] = [
  "personalUse",
  "download",
  "retainedCopy",
  "vaultStorage",
  "updates",
  "resell",
  "commercial",
  "printing",
];

export const RIGHT_LABEL: Record<RightKey, string> = {
  personalUse: "Personal use",
  download: "Download",
  retainedCopy: "Downloaded copy stays yours",
  vaultStorage: "Vault storage",
  updates: "Updates included",
  resell: "Resale allowed",
  commercial: "Commercial rights",
  printing: "Printing rights",
};

/**
 * The rights the app itself acts on, as opposed to the ones that are promises between the buyer and
 * the creator.
 *
 * Every right used to render identically — the same green tick or red cross — while exactly one of
 * them changed what the app did. A member could not tell that "Resale allowed: No" turns a button
 * off while "Printing rights: No" is read by nothing anywhere. Both are real terms; only one has a
 * mechanism behind it, and showing them the same way quietly overstates the second.
 *
 * Be careful about what "acts on" means. Even for `resell`, the app declines to *participate* — it
 * withholds Send. It cannot stop a transfer: a plain SPL NFT moves with any other wallet or a CLI.
 * The copy in the UI must say what the app does, never that it prevents anything.
 */
export const ACTED_ON_RIGHTS: ReadonlySet<RightKey> = new Set<RightKey>(["resell"]);

export interface Deed {
  creator?: string;
  /** e.g. "Personal Use" — the licence name as stated, not interpreted. */
  license?: string;
  /** Royalty model as stated, e.g. "10% to Creator" or "Declining". */
  royaltyModel?: string;
  issuedAt?: number;
  /**
   * `null` means the deed explicitly says it never expires ("Never" / "Lifetime" / "Perpetual").
   * `undefined` means the deed doesn't say. Those are different facts and the UI shows them
   * differently, so they must not collapse into each other here.
   */
  expiresAt?: number | null;
  /** Only the rights the deed actually states. A missing key means "unstated", never "denied". */
  rights: Partial<Record<RightKey, boolean>>;
  creatorRoyaltyBps?: number;
  treasuryAssessmentBps?: number;
  /** True when a stated percentage sits outside the platform's 0–25% limit — shown, but flagged. */
  royaltyOutOfRange: boolean;
  agreementVersion?: string;

  // ---- The trust the property is held under ----
  //
  // A deed is a private contract, and these are the fields that make it one a court could read. The
  // asset sits in a sub-trust under a community's master trust; this deed is that sub-trust's
  // instrument. Each is optional because plenty of assets predate the structure and a deed that
  // doesn't say must not be rendered as though it did.

  /** The trust holding legal title, e.g. "Goshen Trust". */
  holdingTrust?: string;
  /** Who holds it in that capacity. A trustee has a name and an address; a public key does not. */
  trustee?: string;
  /**
   * Governing law, per deed rather than per platform — there is no single jurisdiction for neutral
   * rails, so each contract names its own. Venue is the forum for a dispute under that law.
   */
  governingLaw?: string;
  venue?: string;
  /**
   * The master trust instrument version this deed was issued under. Pinned for the same reason
   * `agreementVersion` is: a trustee amending the master deed later must not retroactively change
   * what a member agreed to years earlier.
   */
  trustVersion?: string;
  /**
   * Whether the trust states that beneficial interest follows the key.
   *
   * This is the clause that keeps the chain authoritative under a trust structure: without it,
   * legal title sits with the trustees and a register decides who benefits, which inverts "the chain
   * is the authority on ownership" into "the chain is an index of the register". Tri-state, because
   * a deed that is silent on it has not made the promise.
   */
  interestFollowsKey?: boolean;

  /** Traits that weren't deed fields, so the detail screen can still show them. */
  extraTraits: { trait: string; value: string }[];
}

export type PropertyStatus = "active" | "expiring" | "expired" | "unknown";

/** Inside this window the deed is about to lapse and the holder should be told while they can act. */
const EXPIRING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** The model states a 0–25% platform limit on creator royalties. */
const MAX_ROYALTY_BPS = 2500;

// ---- Trait matching ---------------------------------------------------------------------------
//
// Issuers write "Creator Royalty", "creator_royalty" and "Royalty" for the same field, so match on
// a normalised key and accept a list of aliases per field. `norm` is shared with `parseKind` in
// solana/collectibles.ts, which reads the asset's type out of these same traits — this comment used
// to claim they agreed while parseKind was in fact matching exactly.

/** Field → the trait names an issuer might plausibly have used, normalised. */
const ALIASES = {
  creator: ["creator", "author", "publisher", "issuedby"],
  // "Rights" is what the deed card itself calls this field ("Rights: Personal Use") — it's the
  // licence summary, not a boolean right, so it belongs here rather than in the rights checklist.
  license: ["license", "licence", "licensetype", "rights"],
  royaltyModel: ["royaltymodel", "royalties"],
  issuedAt: ["issued", "issuedate", "issuedon", "purchased", "purchasedate", "acquired"],
  expiresAt: ["expiration", "expires", "expiry", "expiresat", "validuntil"],
  creatorRoyalty: ["creatorroyalty", "royalty", "royaltypercent", "sellerfee"],
  treasuryAssessment: ["treasuryassessment", "treasuryfee", "platformfee", "treasury"],
  agreementVersion: ["agreementversion", "version", "deedversion"],
  holdingTrust: ["holdingtrust", "trust", "heldintrust", "heldby"],
  trustee: ["trustee", "trustees"],
  governingLaw: ["governinglaw", "jurisdiction", "law"],
  venue: ["venue", "forum", "disputevenue"],
  trustVersion: ["trustversion", "mastertrustversion", "instrumentversion"],
  interestFollowsKey: ["interestfollowskey", "beneficialinterestfollowskey", "interestfollowsthekey"],
  personalUse: ["personaluse", "personal"],
  download: ["download", "downloadable", "downloadallowed"],
  // Whether a downloaded copy survives transfer or revocation. "Download: Yes" says you may take a
  // copy; this says whether that copy is still yours afterwards. They are different products at
  // different prices, and a buyer should not find out which one they bought when they lose signal.
  retainedCopy: ["retainedcopy", "copyretained", "keepsyourcopy", "permanentcopy", "offlinecopy"],
  vaultStorage: ["vaultstorage", "vault", "vaultaccess"],
  updates: ["updates", "updatesincluded", "freeupdates"],
  resell: ["resellallowed", "resell", "resale", "resaleallowed", "transferable", "transferrable"],
  commercial: ["commercialrights", "commercial", "commercialuse"],
  printing: ["printingrights", "printing", "print", "printrights"],
} as const satisfies Record<string, readonly string[]>;

type FieldKey = keyof typeof ALIASES;

/** Every alias that means "this is a deed field", so we can tell deed traits from ordinary ones. */
const DEED_ALIASES = new Set<string>(Object.values(ALIASES).flat());

// ---- Value coercion ---------------------------------------------------------------------------

/**
 * A right's value, as three states rather than two.
 *
 * `undefined` — the deed is SILENT on this right — is the whole reason this returns a tri-state.
 * "The deed forbids commercial use" and "the deed doesn't mention commercial use" are completely
 * different statements to make to someone deciding what they may do with something they own, and a
 * boolean cannot hold both. Defaulting the missing case to `false` would have the app inventing a
 * restriction the creator never wrote — the same class of bug as valuing an unpriced token at a
 * confident $0.00.
 */
function bool(raw: string): boolean | undefined {
  const v = norm(raw);
  // A duration is an affirmative: "Vault Access: Lifetime" grants vault access and says how long
  // for. Reading that as "unstated" would throw away something the issuer plainly did state.
  if (/^(lifetime|perpetual|forever|permanent|unlimited)$/.test(v)) return true;
  if (/^(yes|true|✓|✔|allowed|included|granted|enabled|permitted|1|y)$/.test(v)) return true;
  if (/^(no|false|✗|✘|×|denied|none|excluded|notallowed|prohibited|0|n)$/.test(v)) return false;
  return undefined;
}

/**
 * A percentage as basis points. Accepts "10%", "10", "10% to Creator", "1000 bps", "0.11%".
 * Returns undefined rather than 0 when there's no number to read — an unparseable royalty is
 * unknown, not free.
 */
function bps(raw: string): number | undefined {
  const v = raw.trim();
  const m = /(\d+(?:\.\d+)?)/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return undefined;
  // "1000 bps" is already basis points; a bare number or a "%" is a percentage.
  return /\bbps\b|basispoints?/i.test(v) ? Math.round(n) : Math.round(n * 100);
}

/**
 * A date, or `null` for a deed that explicitly never expires. undefined = unparseable/unstated.
 *
 * `permanent` and `unlimited` are here because `bool` already accepts them as "yes, forever" and the
 * two readers disagreeing on the same word is how "Vault Access: Permanent" and "Expires: Permanent"
 * end up meaning different things in one deed. `none` is the one word they must NOT share: to a
 * right it means the right is denied, and to a term it means there is no end date. Same word,
 * opposite senses, and both are what an issuer would plausibly write.
 */
function when(raw: string): number | null | undefined {
  const v = norm(raw);
  if (/^(never|none|lifetime|perpetual|forever|permanent|unlimited|n\/a)$/.test(v)) return null;
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) ? t : undefined;
}

// ---- Parsing ----------------------------------------------------------------------------------

/**
 * Read the deed out of an asset's metadata.
 *
 * Returns null when nothing deed-shaped is present, so ordinary art doesn't render an empty deed
 * card claiming an agreement that was never written.
 *
 * Takes only the attributes rather than a whole Collectible, because that is genuinely all it reads
 * — and because `deedHistory.ts` parses a stored trait list that was never an asset in memory.
 */
export function parseDeed(item: Pick<Collectible, "attributes">): Deed | null {
  const attrs = item.attributes ?? [];
  if (attrs.length === 0) return null;

  // Index by normalised trait name; first writer wins, so a duplicate trait can't quietly override.
  const byKey = new Map<string, string>();
  const extraTraits: { trait: string; value: string }[] = [];
  for (const a of attrs) {
    const k = norm(a.trait);
    if (DEED_ALIASES.has(k)) {
      if (!byKey.has(k)) byKey.set(k, a.value);
    } else {
      extraTraits.push(a);
    }
  }
  if (byKey.size === 0) return null;

  const read = (field: FieldKey): string | undefined => {
    for (const alias of ALIASES[field]) {
      const v = byKey.get(alias);
      if (v != null) return v;
    }
    return undefined;
  };
  const readBool = (field: FieldKey): boolean | undefined => {
    const raw = read(field);
    return raw == null ? undefined : bool(raw);
  };

  const rights: Partial<Record<RightKey, boolean>> = {};
  for (const r of RIGHT_ORDER) {
    const v = readBool(r);
    if (v !== undefined) rights[r] = v;
  }

  const creatorRoyaltyBps = read("creatorRoyalty") != null ? bps(read("creatorRoyalty")!) : undefined;
  const treasuryAssessmentBps =
    read("treasuryAssessment") != null ? bps(read("treasuryAssessment")!) : undefined;

  const issuedRaw = read("issuedAt");
  const issued = issuedRaw != null ? when(issuedRaw) : undefined;
  const expiresRaw = read("expiresAt");

  return {
    creator: read("creator"),
    license: read("license"),
    royaltyModel: read("royaltyModel"),
    // An issue date of `null` ("Never") is meaningless, so only a real timestamp counts here.
    issuedAt: typeof issued === "number" ? issued : undefined,
    expiresAt: expiresRaw != null ? when(expiresRaw) : undefined,
    rights,
    creatorRoyaltyBps,
    treasuryAssessmentBps,
    royaltyOutOfRange: creatorRoyaltyBps != null && creatorRoyaltyBps > MAX_ROYALTY_BPS,
    agreementVersion: read("agreementVersion"),
    holdingTrust: read("holdingTrust"),
    trustee: read("trustee"),
    governingLaw: read("governingLaw"),
    venue: read("venue"),
    trustVersion: read("trustVersion"),
    interestFollowsKey: readBool("interestFollowsKey"),
    extraTraits,
  };
}

/**
 * Whether the property is live, lapsing, or lapsed.
 *
 * "unknown" covers both "no deed" and "a deed that doesn't state an expiry" — in neither case have
 * we learned anything, and claiming "active" would be asserting a term nobody wrote.
 */
export function propertyStatus(deed: Deed | null, now: number): PropertyStatus {
  if (!deed || deed.expiresAt === undefined) return "unknown";
  if (deed.expiresAt === null) return "active"; // stated: never expires
  if (deed.expiresAt <= now) return "expired";
  return deed.expiresAt - now <= EXPIRING_WINDOW_MS ? "expiring" : "active";
}

/**
 * Whether the AGREEMENT permits transfer — a different question from whether the token program
 * does (`Collectible.transferable`).
 *
 * Returns `undefined` when the deed is silent, which the caller must treat as "no restriction
 * stated" rather than as a prohibition.
 *
 * Worth being blunt about the limit here: nothing in this app can *enforce* a `false`. A plain SPL
 * NFT moves with any other wallet or a CLI. Withholding the Send button states the agreement; only
 * Token-2022's NonTransferable extension (or a rule set / soulbound design, chosen at mint) makes
 * it true. Copy built on this must say "not transferable under its agreement", never "cannot be
 * transferred".
 */
export function deedAllowsTransfer(deed: Deed | null): boolean | undefined {
  return deed?.rights.resell;
}
