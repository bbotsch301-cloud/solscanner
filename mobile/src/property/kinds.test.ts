/**
 * Invariants of the kind table.
 *
 * `Record<CollectibleKind, KindFacts>` already forces every kind to be *present* — that is the point
 * of the consolidation and the compiler enforces it for free. What it cannot say is whether the
 * entries are sensible, and the entries encode domain rules that were previously implicit in four
 * separate files. These pin the ones that would be quietly wrong rather than obviously broken.
 */
import { describe, expect, it } from "vitest";
import { STANDING_VALUES } from "./kindValues";
import { BY_MIME, KINDS, kindBadge } from "./kinds";

const entries = Object.entries(KINDS);

describe("every kind", () => {
  it("has a title and a verb", () => {
    for (const [kind, f] of entries) {
      expect(f.title.trim(), `${kind}.title`).not.toBe("");
      expect(f.verb.trim(), `${kind}.verb`).not.toBe("");
    }
  });

  it("has an icon and a colour, badged or not", () => {
    // `art` carries no badge but keeps both, so nothing downstream has to special-case it.
    for (const [kind, f] of entries) {
      expect(f.icon, `${kind}.icon`).toBeTruthy();
      expect(f.color, `${kind}.color`).toMatch(/^#/);
    }
  });
});

describe("standing is not property", () => {
  it("gives no Vault shelf to anything that is standing", () => {
    // The load-bearing rule of the whole model: standing is what a member IS — a membership, an
    // office, a credential, a belonging — and the Vault holds what they OWN. A standing kind landing
    // on a shelf would put "who you are" among "what you bought", which is the one confusion the
    // deed design exists to prevent.
    for (const kind of STANDING_VALUES) {
      expect(KINDS[kind].experience, `${kind} must have no shelf`).toBeNull();
    }
  });

  it("gives every non-standing kind either a shelf or a reason", () => {
    const standing = new Set<string>(STANDING_VALUES);
    for (const [kind, f] of entries) {
      if (standing.has(kind)) continue;
      // Null here would mean a property kind that can never appear in the Vault, which is a claim
      // worth making deliberately rather than by omission — today nothing does.
      expect(f.experience, `${kind}.experience`).not.toBeNull();
    }
  });
});

describe("the mime fallback", () => {
  it("is used only where the kind genuinely cannot decide", () => {
    // A bare file could be a PDF to read or a video to watch. Everything else states its shelf, and
    // widening this set would mean the issuer's own word about what a thing IS stopped being trusted.
    const byMime = entries.filter(([, f]) => f.experience === BY_MIME).map(([k]) => k);
    expect(byMime.sort()).toEqual(["art", "file"]);
  });
});

describe("badges", () => {
  it("are carried by everything except plain art", () => {
    const unbadged = entries.filter(([, f]) => f.badge === null).map(([k]) => k);
    expect(unbadged).toEqual(["art"]);
  });

  it("come back whole, or not at all", () => {
    expect(kindBadge("book")).toEqual({
      label: "Book",
      icon: KINDS.book.icon,
      color: KINDS.book.color,
    });
    expect(kindBadge("art")).toBeNull();
  });

  it("differ from the title only where that was a decision", () => {
    // Two tables in two files became two fields side by side. These are the only two that differ,
    // and both are deliberate: a grid chip is shorter than a header, and art has no chip at all.
    const differ = entries.filter(([, f]) => f.badge !== null && f.badge !== f.title).map(([k]) => k);
    expect(differ).toEqual(["membership"]);
    expect(KINDS.membership.badge).toBe("Member");
    expect(KINDS.membership.title).toBe("Membership");
    expect(KINDS.art.title).toBe("Collectible");
  });
});
