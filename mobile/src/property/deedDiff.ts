/**
 * What changed between two deeds, in the words a member reads.
 *
 * Pure and free of I/O on purpose — it is the part worth reasoning about carefully, and separating
 * it from `deedHistory.ts`'s storage is what makes it runnable outside the app at all. The wallet
 * has no test runner, so a function that can only be exercised on a device is a function nobody
 * checks.
 */
import { parseDeed, RIGHT_LABEL, RIGHT_ORDER, type Deed } from "./deed";
import type { Trait } from "./onchainDeed";

/** One term that reads differently now, in the words the deed panel uses for it. */
export interface DeedChange {
  label: string;
  from: string;
  to: string;
}

export interface DeedDelta {
  changes: DeedChange[];
  /** The version as it stood when the member last read the deed, and as it stands now. */
  fromVersion?: string;
  toVersion?: string;
  /**
   * Terms moved but `Agreement Version` did not.
   *
   * Worth saying out loud rather than glossing: bumping the version on an amendment is the one
   * courtesy the whole visibility argument rests on, and an issuer who changed the terms without
   * bumping it has skipped it. That is not necessarily bad faith — but it is exactly the case a
   * member cannot detect for themselves.
   */
  versionUnchanged: boolean;
}

/**
 * The deed flattened into the labelled rows a member reads, so a diff speaks their language.
 *
 * "Resale allowed: Yes → No" is a sentence someone can act on. "resell: true → false" is a field
 * name, and a trait name like `Resale Allowed` is the issuer's spelling of it, which may not even be
 * the spelling the panel showed.
 */
function rows(deed: Deed): Map<string, string> {
  const out = new Map<string, string>();
  const put = (label: string, value: string | undefined | null) => {
    if (value != null && value !== "") out.set(label, value);
  };

  for (const r of RIGHT_ORDER) {
    const v = deed.rights[r];
    // Absent stays absent. A right that was never stated and still isn't hasn't changed, and
    // recording it as "not stated" would make every deed differ from every other.
    if (v !== undefined) put(RIGHT_LABEL[r], v ? "Yes" : "No");
  }

  put("Creator", deed.creator);
  put("License", deed.license);
  put("Royalty model", deed.royaltyModel);
  if (deed.creatorRoyaltyBps != null) put("Creator royalty", `${Number((deed.creatorRoyaltyBps / 100).toFixed(2))}%`);
  if (deed.treasuryAssessmentBps != null)
    put("Treasury assessment", `${Number((deed.treasuryAssessmentBps / 100).toFixed(2))}%`);
  // Dates as ISO days rather than locale strings: a diff has to be stable across devices and
  // locales, and "1 March 2027" changing to "March 1, 2027" is not an amendment.
  if (deed.issuedAt != null) put("Issued", new Date(deed.issuedAt).toISOString().slice(0, 10));
  if (deed.expiresAt === null) put("Expires", "Never");
  else if (deed.expiresAt != null) put("Expires", new Date(deed.expiresAt).toISOString().slice(0, 10));
  put("Held in trust by", deed.holdingTrust);
  put("Trustee", deed.trustee);
  put("Governing law", deed.governingLaw);
  put("Venue", deed.venue);
  put("Trust version", deed.trustVersion);
  if (deed.interestFollowsKey != null)
    put("Beneficial interest follows the key", deed.interestFollowsKey ? "Yes" : "No");

  // Anything the parser doesn't map is still part of what was written, and the panel shows it.
  for (const t of deed.extraTraits) put(t.trait, t.value);

  return out;
}

/** How an absent term reads in a diff. Silence is a state, and naming it is the point. */
const ABSENT = "not stated";

/**
 * What changed between two deeds. Pure, and the part worth reasoning about carefully.
 *
 * Note that `Agreement Version` is handled separately rather than appearing as an ordinary row: it
 * is the label on the change, not one of the things that changed.
 */
export function deedChanges(previous: Trait[], current: Trait[]): DeedDelta {
  const before = parseDeed({ attributes: previous });
  const after = parseDeed({ attributes: current });

  const beforeRows = before ? rows(before) : new Map<string, string>();
  const afterRows = after ? rows(after) : new Map<string, string>();

  const changes: DeedChange[] = [];
  for (const label of new Set([...beforeRows.keys(), ...afterRows.keys()])) {
    const from = beforeRows.get(label) ?? ABSENT;
    const to = afterRows.get(label) ?? ABSENT;
    if (from !== to) changes.push({ label, from, to });
  }
  // Stable order so the same amendment reads the same way twice.
  changes.sort((a, b) => a.label.localeCompare(b.label));

  const fromVersion = before?.agreementVersion;
  const toVersion = after?.agreementVersion;

  return {
    changes,
    fromVersion,
    toVersion,
    versionUnchanged: changes.length > 0 && fromVersion === toVersion,
  };
}
