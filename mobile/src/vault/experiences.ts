/**
 * The Vault, grouped the way a person thinks about what they own.
 *
 * "Organize by Library, Learning, AI, Media, Documents, Software. Not folders. Experiences." A
 * folder is where a file lives; an experience is what you do with it. Grouping by mime type would
 * be the former dressed up as the latter, so the grouping below leads with what the issuer said the
 * thing IS (its kind) and only falls back to the file's mime when the kind doesn't settle it.
 *
 * ## What this can and can't know
 *
 * The Vault proper is server-delivered encrypted content — the wallet never holds it (see
 * `access/vault.ts`). What the wallet knows is which property it owns that **opens**, and what kind
 * of thing each one is. So this is the shelf, not the safe: it lists what the member can reach, and
 * `attemptGatedUrl` handles proving ownership at the moment they reach for it.
 *
 * Anything with no resolvable content is left out entirely rather than listed as an empty row. A
 * vault that lists things you can't open isn't a vault.
 */
import { resolveAccess } from "../access/resolve";
import { isArchived, isHiddenItem, type Collectible } from "../solana/collectibles";

export type ExperienceId = "library" | "learning" | "media" | "documents" | "software" | "ai" | "passes";

export interface Experience {
  id: ExperienceId;
  items: Collectible[];
}

/** Display order — roughly how often a member reaches for each. */
const ORDER: ExperienceId[] = ["library", "learning", "media", "documents", "software", "ai", "passes"];

/**
 * Which experience an item belongs to.
 *
 * Kind first, because the issuer stating "this is a Course" is better evidence than the extension
 * of whatever file happens to be attached. Mime only decides the cases kind leaves genuinely open:
 * a bare `file` could be a PDF to read or a video to watch, and those aren't the same experience.
 */
function experienceOf(item: Collectible, mime?: string): ExperienceId | null {
  switch (item.kind) {
    case "book":
      return "library";
    case "course":
      return "learning";
    case "music":
      return "media";
    case "software":
      return "software";
    case "ai":
      return "ai";
    case "ticket":
    case "subscription":
    case "portal":
      return "passes";
    case "file":
    case "art":
      if (mime?.startsWith("video/") || mime?.startsWith("audio/")) return "media";
      if (mime === "application/pdf" || mime === "application/epub+zip") return "documents";
      // An art piece with an animation_url is something to watch; otherwise it isn't vault content.
      return item.kind === "art" ? (item.animationUrl ? "media" : null) : "documents";
    default:
      // Standing (see STANDING_VALUES in solana/collectibles.ts) isn't vault content —
      // it belongs on the Association screen. Deliberately not an assertNever: a new HOLDING kind
      // should land here and be triaged, not fail to compile a screen that merely groups things.
      return null;
  }
}

/**
 * Group everything openable into experiences. Items keep the order the snapshot gave them, which
 * is the order the indexer returned — stable between renders, which is what matters here.
 *
 * Hidden and archived items are excluded for the same reason they're excluded from standing: spam
 * shouldn't fill a member's library, and something they deliberately put away isn't on the shelf.
 */
export function vaultExperiences(items: Collectible[]): Experience[] {
  const buckets = new Map<ExperienceId, Collectible[]>();

  for (const item of items) {
    if (isHiddenItem(item) || isArchived(item.mint)) continue;
    const access = resolveAccess(item);
    if (!access) continue; // nothing to open — not vault content
    const id = experienceOf(item, access.mime);
    if (!id) continue;
    const bucket = buckets.get(id);
    if (bucket) bucket.push(item);
    else buckets.set(id, [item]);
  }

  return ORDER.filter((id) => buckets.has(id)).map((id) => ({ id, items: buckets.get(id)! }));
}

/** Total openable items across every experience. */
export function vaultCount(experiences: Experience[]): number {
  return experiences.reduce((n, e) => n + e.items.length, 0);
}
