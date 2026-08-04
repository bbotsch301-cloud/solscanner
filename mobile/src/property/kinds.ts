/**
 * Everything the app knows about a kind of Key, in one exhaustive table.
 *
 * ## What this replaces, and what was actually wrong
 *
 * **Four** tables classified a Key, in four files, none aware of the others:
 *
 *   • `KIND_BADGE` in `components/PropertyGallery.tsx` — badge noun, icon, colour
 *   • `KIND_LABEL` in `screens/CollectibleDetailScreen.tsx` — the header noun
 *   • `accessVerb` in `access/resolve.ts` — the verb on the primary button
 *   • `experienceOf` in `vault/experiences.ts` — which Vault shelf it lands on
 *
 * Four was found by experiment, not by reading: adding a throwaway kind and seeing where the
 * compiler complained. Three was the number you get from grepping for the obvious names.
 *
 * **The concrete bug was the asymmetry, not the duplication.** `accessVerb` and `KIND_LABEL` were
 * exhaustive, so a new kind failed to compile until it was given a verb and a title. `KIND_BADGE`
 * was `Partial<Record<…>>`, so the same new kind silently got *no badge at all* and just rendered as
 * unlabelled art. And `experienceOf` ended in `default: return null`, so it silently became "not
 * vault content" and never reached a shelf. Two tables forced the author's hand; two let them
 * forget — and the two that let them forget are the two a member would have noticed.
 *
 * ## What a new kind costs now, measured
 *
 * Adding one produces **three** compile errors, and they are three genuinely different questions
 * rather than the same answer typed four times:
 *
 *   1. `property/kinds.ts` — what is it called, what does it look like, what is the verb, which shelf
 *   2. `access/resolve.ts` — where does its content come from (`resolveAccess` keeps its `assertNever`)
 *   3. `solana/collectibles.ts` — is it standing or property, in the runtime list
 *
 * That is the floor, not a failure to consolidate further. Collapsing those three would mean one
 * table that knows about presentation, content resolution and the standing/property split at once.
 *
 * ## What deliberately stayed separate
 *
 * `LOOK` in `VaultScreen.tsx` maps an *experience* to a label and icon. It is not this axis — seven
 * shelves rather than fourteen kinds — and although five of its icons happen to match a kind's icon
 * today (Library/book, Learning/course, Software, AI, Passes/ticket), that equality is a
 * coincidence of vocabulary, not a fact about the domain. Forcing them to share would couple the
 * name of a shelf to the badge on a card, and a shelf can hold more than one kind.
 */
// `import type` deliberately: the only use of Ionicons here is `keyof typeof …glyphMap`, a type
// query, and a value import would drag React Native in behind it. `theme` is pure constants. Between
// them that keeps this module loadable outside a device, which is what lets `kinds.test.ts` check
// the table rather than trust it.
import type { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import type { CollectibleKind } from "./kindValues";

/** The Vault's shelves — "not folders, experiences". Grouping logic lives in `vault/experiences.ts`. */
export type ExperienceId =
  | "library"
  | "learning"
  | "media"
  | "documents"
  | "software"
  | "ai"
  | "passes";

/**
 * The shelf is decided by the attached file rather than by the kind.
 *
 * Only `file` and `art` use it, and for good reason: a bare file could be a PDF to read or a video
 * to watch, and those are not the same experience. Written as a sentinel rather than `undefined` so
 * "the mime decides" is a stated answer rather than an omission.
 */
export const BY_MIME = "by-mime";

export interface KindFacts {
  /**
   * The full noun, for a screen header. Always present — every kind can be titled.
   *
   * Separate from `badge` on purpose, and the two differ in exactly the places you'd expect: a grid
   * chip says "Member" where a header says "Membership", and `art` has no badge at all but still
   * needs a title, which is "Collectible". They were two tables in two files; keeping them adjacent
   * is what makes the difference legible as a choice rather than a drift.
   */
  title: string;
  /**
   * The noun on the grid badge, or null for a kind that carries none.
   *
   * Only `art` is null, and deliberately: plain artwork reads as itself, and badging it would make
   * a wall of images noisier without telling anyone anything.
   */
  badge: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** Verb for the primary action, so a book reads "Read" rather than a generic "Open". */
  verb: string;
  /** Which Vault shelf; null when the kind isn't vault content at all. */
  experience: ExperienceId | null | typeof BY_MIME;
}

export const KINDS: Record<CollectibleKind, KindFacts> = {
  // ── Standing: what a member IS. None of it is vault content, so none of it has a shelf. ──
  membership: {
    title: "Membership",
    badge: "Member",
    icon: "card-outline",
    color: colors.accent,
    verb: "Enter",
    experience: null,
  },
  office: {
    title: "Office",
    badge: "Office",
    icon: "shield-outline",
    color: colors.primary,
    verb: "View office",
    experience: null,
  },
  credential: {
    title: "Credential",
    badge: "Credential",
    icon: "ribbon-outline",
    color: colors.primary,
    verb: "View credential",
    experience: null,
  },
  community: {
    title: "Community",
    badge: "Community",
    icon: "people-circle-outline",
    color: colors.accent,
    verb: "Enter community",
    experience: null,
  },

  // ── Property: what a member OWNS. ──
  book: {
    title: "Book",
    badge: "Book",
    icon: "book-outline",
    color: colors.positive,
    verb: "Read",
    experience: "library",
  },
  course: {
    title: "Course",
    badge: "Course",
    icon: "school-outline",
    color: colors.positive,
    verb: "Start course",
    experience: "learning",
  },
  software: {
    title: "Software",
    badge: "Software",
    icon: "code-slash-outline",
    color: colors.textMuted,
    verb: "Open software",
    experience: "software",
  },
  music: {
    title: "Music",
    badge: "Music",
    icon: "musical-notes-outline",
    color: colors.accent,
    verb: "Listen",
    experience: "media",
  },
  ai: {
    title: "AI",
    badge: "AI",
    icon: "sparkles-outline",
    color: colors.primary,
    verb: "Open assistant",
    experience: "ai",
  },
  subscription: {
    title: "Subscription",
    badge: "Subscription",
    icon: "refresh-outline",
    color: colors.warning,
    verb: "Open",
    experience: "passes",
  },
  ticket: {
    title: "Ticket",
    badge: "Ticket",
    icon: "ticket-outline",
    color: colors.primary,
    verb: "Open ticket",
    experience: "passes",
  },
  portal: {
    title: "Portal",
    badge: "Portal",
    icon: "planet-outline",
    color: colors.accent,
    verb: "Enter portal",
    experience: "passes",
  },
  file: {
    title: "File",
    badge: "File",
    icon: "document-outline",
    color: colors.textMuted,
    verb: "View file",
    experience: BY_MIME,
  },
  art: {
    title: "Collectible",
    // The one unbadged kind — see `badge` above. It keeps an icon and colour anyway so that nothing
    // has to special-case it if some future surface wants a mark per kind.
    badge: null,
    icon: "image-outline",
    color: colors.textMuted,
    verb: "Open",
    experience: BY_MIME,
  },
};

/** The grid badge for a kind, or null when it carries none. */
export function kindBadge(
  kind: CollectibleKind,
): { label: string; icon: keyof typeof Ionicons.glyphMap; color: string } | null {
  const k = KINDS[kind];
  return k.badge ? { label: k.badge, icon: k.icon, color: k.color } : null;
}
