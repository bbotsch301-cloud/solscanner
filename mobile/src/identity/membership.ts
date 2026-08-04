/**
 * Standing — who the member is in the Association, derived from the keys they hold.
 *
 * "Never use usernames as authority. Authority is determined by Keys." This is that rule as code:
 * nothing here consults a server, an account, or a stored role. It reads the collectibles the wallet
 * already has and reports what they say. Hold the Office key, hold the office.
 *
 * Pure and synchronous, over the snapshot `solana/collectibles.ts` keeps on disk — so standing
 * renders on the first frame of a cold open and keeps working offline.
 *
 * ## The limit, stated plainly
 *
 * This is a DISPLAY derivation. It decides what the app shows, and nothing more. Any server acting
 * on a member's authority must re-derive it from on-chain ownership at the time of the request — a
 * client can claim anything, and a key can be sold or expire between one screen and the next. The
 * same reasoning as the Send button: the wallet describes the agreement, it doesn't enforce it.
 */
import { parseDeed, propertyStatus, type PropertyStatus } from "../property/deed";
import { isArchived, isHiddenItem, isStandingKind, type Collectible } from "../solana/collectibles";
import { assertNever } from "../chains/registry";

// The list of standing kinds used to live here, hand-copied from the union in
// solana/collectibles.ts and hand-synced with a third copy in components/PropertyGallery.tsx. It is
// now `STANDING_VALUES`, exported from the module that owns the type, and `isStandingKind` is the
// guard. Re-exporting it under a second name here would just start the drift over again.

export interface StandingKey {
  item: Collectible;
  status: PropertyStatus;
  /** Stated term end, ms. `null` = stated never; `undefined` = the deed doesn't say. */
  expiresAt?: number | null;
  /** When it was issued, ms — "Member since". */
  issuedAt?: number;
}

export interface Standing {
  /** Gateway Membership: the key to the Association itself. The deepest-standing one held. */
  gateway: StandingKey | null;
  offices: StandingKey[];
  credentials: StandingKey[];
  /**
   * Every community the member belongs to — including under whatever name that community gives the
   * belonging. Fellowship used to be a separate bucket here; it was one association's word for this,
   * and the rails don't get to assume it. The key's own metadata carries the name.
   */
  communities: StandingKey[];
  /** Anything above whose term has ended. Still owned — worth showing, not worth counting. */
  lapsed: StandingKey[];
  /** True when the member holds an unexpired Gateway Membership. */
  isMember: boolean;
}

const EMPTY: Standing = {
  gateway: null,
  offices: [],
  credentials: [],
  communities: [],
  lapsed: [],
  isMember: false,
};

function toKey(item: Collectible, now: number): StandingKey {
  const deed = parseDeed(item);
  return {
    item,
    status: propertyStatus(deed, now),
    expiresAt: deed?.expiresAt,
    issuedAt: deed?.issuedAt,
  };
}

/**
 * Read the member's standing out of the keys they hold.
 *
 * Hidden and archived items are excluded: the spam heuristic catches airdropped junk, and an
 * airdropped "Office" NFT must not confer an office. Archived is the member's own choice to put
 * something away, and standing they've filed away isn't standing they're asserting.
 */
export function deriveStanding(items: Collectible[], now: number): Standing {
  if (items.length === 0) return EMPTY;

  const out: Standing = { ...EMPTY, offices: [], credentials: [], communities: [], lapsed: [] };

  for (const item of items) {
    if (!isStandingKind(item.kind)) continue;
    if (isHiddenItem(item) || isArchived(item.mint)) continue;

    const key = toKey(item, now);
    if (key.status === "expired") {
      out.lapsed.push(key);
      continue;
    }

    switch (item.kind) {
      case "membership":
        // Longest-held wins, so a newer duplicate can't reset "Member since".
        if (!out.gateway || (key.issuedAt ?? Infinity) < (out.gateway.issuedAt ?? Infinity)) out.gateway = key;
        break;
      case "office":
        out.offices.push(key);
        break;
      case "credential":
        out.credentials.push(key);
        break;
      case "community":
        out.communities.push(key);
        break;
      default:
        // Real exhaustiveness now that `isStandingKind` has narrowed the kind: a new standing kind
        // stops the build here rather than being silently dropped from a member's standing.
        assertNever(item.kind, "standing kind in deriveStanding");
    }
  }

  out.isMember = out.gateway !== null;
  return out;
}

/** Total live standing keys — what the Association screen counts. */
export function standingCount(s: Standing): number {
  return (
    (s.gateway ? 1 : 0) +
    s.offices.length +
    s.credentials.length +
    s.communities.length
  );
}
