/**
 * The vocabulary: which kinds of Key exist, and which of them are standing.
 *
 * Lifted out of `solana/collectibles.ts` unchanged. It was pure data — two unions, two value lists,
 * and the guards that keep them in step — living inside a module that also fetches from an indexer
 * and writes to AsyncStorage. So "what kinds exist" could not be loaded without React Native: none
 * of it could be tested, and `property/kinds.ts` had to reach into a networking module to learn four
 * names.
 *
 * Kept separate from `kinds.ts` rather than merged into it, so this stays free of presentation.
 * `kinds.ts` imports the theme; `collectibles.ts` should not pick up a transitive dependency on
 * colours in order to know what a kind is.
 */
import { norm } from "../metadata/traits";

/**
 * What a member IS — standing, not stock.
 *
 * These are the classes the rails carry. **A community's own titles are not types here.** One
 * association's "Fellowship" is another's "Chapter" and another's nothing at all; hard-coding any of
 * them makes the rails one community's software. A title is metadata on a Community Key, named by
 * whoever issued it — see `LEGACY_KINDS` for what happened to the one that used to be a type.
 */
export type StandingKind =
  /** Gateway Membership — access to the Association itself. */
  | "membership"
  /** Delegated authority. Where authority comes from, instead of a username. */
  | "office"
  /** A certification or qualification. */
  | "credential"
  /** Belonging to a community within the Association — including its own name for that belonging. */
  | "community";

/** What a member OWNS or can use. The Property Templates set. */
export type TemplateKind =
  | "book"
  | "course"
  | "software"
  | "music"
  /** An AI agent or companion the member owns. */
  | "ai"
  /** Time-limited access that lapses. */
  | "subscription"
  | "ticket"
  | "portal"
  | "file"
  | "art";

/**
 * The two together. `parseKind` reads whichever the issuer wrote into the metadata.
 *
 * Split into two named types rather than one flat union because the standing/holdings distinction is
 * load-bearing in four separate places — standing confers membership, holdings fill the Vault — and
 * it used to be re-typed by hand at each of them, with a comment in one admitting it was hand-synced
 * with another. Now `STANDING_VALUES` below is the single copy and everything derives from it.
 */
export type CollectibleKind = StandingKind | TemplateKind;

/**
 * The kinds that say what a member IS. **The only copy.**
 *
 * `identity/membership.ts` and `components/PropertyGallery.tsx` both derive their sets from this
 * rather than restating it, which is what they used to do — three hand-maintained copies of the same
 * four names, in three shapes, in three modules.
 */
export const STANDING_VALUES = ["membership", "office", "credential", "community"] as const;

const TEMPLATE_VALUES = [
  "book",
  "course",
  "software",
  "music",
  "ai",
  "subscription",
  "ticket",
  "portal",
  "file",
  "art",
] as const;

// A value missing from the arrays above is unparseable forever — `parseKind` would quietly answer
// "art" for it, and nothing would fail. These two lines make that a compile error instead: adding a
// kind to either union without listing it here stops the build.
type _StandingListed = Exclude<StandingKind, (typeof STANDING_VALUES)[number]>;
type _TemplateListed = Exclude<TemplateKind, (typeof TEMPLATE_VALUES)[number]>;
const _kindsAreListed: [_StandingListed, _TemplateListed] extends [never, never] ? true : never = true;
void _kindsAreListed;

const KIND_VALUES = new Set<string>([...STANDING_VALUES, ...TEMPLATE_VALUES]);

/**
 * Whether a kind says what a member IS rather than what they own.
 *
 * A type guard rather than a bare `includes`, so a caller that has filtered on it can then switch
 * over `StandingKind` exhaustively — which is how `deriveStanding` gets a real `assertNever` instead
 * of a `default` branch it had to describe as "listed here for readability".
 */
export function isStandingKind(kind: CollectibleKind): kind is StandingKind {
  return (STANDING_VALUES as readonly string[]).includes(kind);
}

/**
 * Kinds that were types once and are metadata now. Permanent — assets are already minted with them.
 *
 * `fellowship` was "ecclesiastical participation", which is one association's word for belonging.
 * The rails carry Community; what a community calls its members is theirs to name. An existing
 * Fellowship key keeps working and keeps the name its own metadata gives it, rather than degrading
 * into generic art the way an unrecognised value otherwise would.
 */
const LEGACY_KINDS: Record<string, CollectibleKind> = {
  fellowship: "community",
};

/** A legacy name's modern kind, or null. `norm` so casing and spacing don't decide the answer. */
export function legacyKind(value: string): CollectibleKind | null {
  return LEGACY_KINDS[norm(value)] ?? null;
}

export { KIND_VALUES };
