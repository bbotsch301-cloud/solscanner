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
import { isArchived, isHiddenItem, type Collectible, type CollectibleKind } from "../solana/collectibles";

/** The kinds that say what a member IS. Everything else is a holding. */
export const STANDING_KINDS: CollectibleKind[] = [
  "membership",
  "fellowship",
  "office",
  "credential",
  "community",
];

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
  fellowships: StandingKey[];
  offices: StandingKey[];
  credentials: StandingKey[];
  communities: StandingKey[];
  /** Anything above whose term has ended. Still owned — worth showing, not worth counting. */
  lapsed: StandingKey[];
  /** True when the member holds an unexpired Gateway Membership. */
  isMember: boolean;
}

const EMPTY: Standing = {
  gateway: null,
  fellowships: [],
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

  const out: Standing = { ...EMPTY, fellowships: [], offices: [], credentials: [], communities: [], lapsed: [] };

  for (const item of items) {
    if (!STANDING_KINDS.includes(item.kind)) continue;
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
      case "fellowship":
        out.fellowships.push(key);
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
        break; // a holding, not standing — filtered above, listed here for readability
    }
  }

  out.isMember = out.gateway !== null;
  return out;
}

/** Total live standing keys — what the Association screen counts. */
export function standingCount(s: Standing): number {
  return (
    (s.gateway ? 1 : 0) +
    s.fellowships.length +
    s.offices.length +
    s.credentials.length +
    s.communities.length
  );
}
