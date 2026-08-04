/**
 * What the deed permits us to keep on this device.
 *
 * Three products, and the creator chose which one they were selling before anyone bought it:
 *
 *   • **stream-only** — nothing on disk, ever. Needs a connection to read.
 *   • **ephemeral** — a copy is allowed, and it goes when the key goes.
 *   • **retained** — a copy is allowed and survives losing the key. You sold the key, not your copy.
 *
 * That last distinction is what makes resale coherent. A member who resells a key they downloaded
 * under `Retained Copy: Yes` keeps the file because that is what they bought; one who downloaded
 * under `No` does not, and the app deletes it. Neither is DRM and neither pretends to be — see the
 * note on what cannot be claimed in `store.ts`.
 *
 * Pure and free of I/O so it can actually be run outside the app, which is the only way any of this
 * gets tested — the wallet has no test runner and a device is not always to hand.
 */
import type { Deed } from "../deed";

/**
 * Why nothing may be stored, when nothing may be stored.
 *
 * `denied` and `unstated` behave identically and read completely differently. "The deed doesn't
 * permit downloads" is the creator's decision; "the deed doesn't mention downloads" is the creator
 * not having addressed it. Collapsing them tells a member they were refused something nobody ever
 * refused — the same class of mistake `deed.ts`'s `bool()` exists to prevent, and the reason this
 * returns a reason at all rather than a boolean.
 */
export type StreamOnlyReason = "denied" | "unstated" | "no-deed";

export type CopyPolicy =
  | { kind: "stream-only"; reason: StreamOnlyReason }
  | { kind: "ephemeral" }
  | { kind: "retained" };

/**
 * The tier this deed selects.
 *
 * Gated on `download === true`, never on `!== false`. The rights are tri-state and absent means the
 * deed is SILENT; reading silence as permission would have the app keeping a copy of something
 * nobody agreed could be kept.
 */
export function copyPolicy(deed: Deed | null): CopyPolicy {
  if (!deed) return { kind: "stream-only", reason: "no-deed" };

  const download = deed.rights.download;
  if (download === undefined) return { kind: "stream-only", reason: "unstated" };
  if (download === false) return { kind: "stream-only", reason: "denied" };

  // `retainedCopy` absent is NOT retained. The asymmetry decides it: over-deleting is recoverable —
  // the member still holds the key and can download again — while over-retaining is not, because
  // content stays on a device after the right to it has gone. A deed that grants download and says
  // nothing about retention has not promised the copy outlives the key.
  return deed.rights.retainedCopy === true ? { kind: "retained" } : { kind: "ephemeral" };
}

/** Whether this tier puts anything on disk at all. */
export function permitsCopy(p: CopyPolicy): boolean {
  return p.kind !== "stream-only";
}

/**
 * What to tell a member about why something isn't available offline.
 *
 * Returns null when it is, so a caller can render this unconditionally.
 */
export function explainPolicy(p: CopyPolicy): string | null {
  switch (p.kind) {
    case "retained":
    case "ephemeral":
      return null;
    case "stream-only":
      switch (p.reason) {
        case "denied":
          return "This item's deed doesn't permit downloads, so it opens online only.";
        case "unstated":
          return "This item's deed doesn't mention downloads, so it opens online only.";
        case "no-deed":
          return "This item carries no deed, so there's nothing granting an offline copy.";
      }
  }
}

/**
 * How the member should understand a copy they have.
 *
 * The ephemeral wording is load-bearing: "kept while you hold this key" is true, and "yours forever"
 * would be a promise the deed did not make.
 */
export function describeCopy(p: CopyPolicy): string | null {
  if (p.kind === "retained") return "Yours to keep — this copy stays even if the key doesn't.";
  if (p.kind === "ephemeral") return "Kept on this device while you hold this key.";
  return null;
}

/**
 * Whether a copy of this size and type is worth keeping locally at all.
 *
 * Permission is not an instruction. Large video is deliberately excluded: the app caches the
 * *entitlement* for media rather than the bytes (see `access/entitlement.ts`), which is what makes
 * returning to a film instant without a multi-gigabyte encrypted file, a decrypt pass before the
 * first frame, or a download that outlives its own 300-second grant.
 *
 * One function rather than a threshold buried in a download handler, so the rule can be read.
 */
export const MAX_LOCAL_BYTES = 256 * 1024 * 1024;

export function shouldStoreLocally(mime: string | undefined, sizeBytes: number | null): boolean {
  if (sizeBytes !== null && sizeBytes > MAX_LOCAL_BYTES) return false;
  // Media streams. An unknown size on a media type is treated as too big rather than gambled on —
  // guessing wrong here means a download nobody asked for on someone's cellular connection.
  if (mime && (mime.startsWith("video/") || mime.startsWith("audio/"))) return false;
  return true;
}
