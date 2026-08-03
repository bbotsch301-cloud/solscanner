/**
 * What "Open" means for a given pass — which URL, and through which door.
 *
 * Two doors exist and they are not interchangeable:
 *   • "tab"     — a custom tab (a real browser: PDFs, media, downloads). No wallet injected.
 *   • "browser" — the in-app WebView, the only place `window.solana` exists. A portal that wants
 *                 the holder to sign something has to land here.
 *
 * Which URL matters too: a book's payload is in `files[]`, while a ticket's is its `external_url`.
 * Before this existed, everything used `external_url` and a book's actual content was unreachable.
 */
import type { Collectible, CollectibleKind } from "../solana/collectibles";
import { assertNever } from "../chains/registry";
import { isSafeContentUrl } from "../solana/uri";

export interface Access {
  url: string;
  mime?: string;
  route: "tab" | "browser";
}

/** The first file that isn't the cover art — i.e. the thing the pass actually grants. */
function payloadFile(item: Collectible): { uri: string; mime?: string } | undefined {
  return item.files?.find((f) => !f.mime?.startsWith("image/")) ?? undefined;
}

export function resolveAccess(item: Collectible): Access | null {
  let url: string | undefined;
  let mime: string | undefined;

  switch (item.kind) {
    case "book":
    case "file": {
      const f = payloadFile(item);
      url = f?.uri ?? item.animationUrl ?? item.externalUrl;
      mime = f?.mime;
      break;
    }
    // Standing and access keys all point at whatever they unlock, rather than carrying a payload.
    case "ticket":
    case "membership":
    case "fellowship":
    case "office":
    case "credential":
    case "community":
    case "subscription":
    case "portal":
      url = item.externalUrl ?? item.animationUrl;
      break;
    case "art":
      // An animation_url is the interactive/video piece; otherwise the project link.
      url = item.animationUrl ?? item.externalUrl;
      break;
    default:
      // Exhaustive on purpose. This used to be a bare `default`, which silently routed any new
      // kind as art — and more key types are coming (Fellowship, Office, Subscription). Now
      // adding one is a compile error here, listing every place that has to decide about it.
      return assertNever(item.kind, "collectible kind in resolveAccess");
  }

  // Attacker-controlled metadata — anyone can airdrop a token carrying any URL. Previously this
  // string went straight into the app with no check at all.
  if (!url || !isSafeContentUrl(url)) return null;

  // A portal is the one kind expected to talk to the wallet, so it keeps the bridged WebView.
  return { url, mime, route: item.kind === "portal" ? "browser" : "tab" };
}

/** Verb for the primary action, so a book reads "Read" rather than a generic "Open". */
export function accessVerb(kind: CollectibleKind): string {
  switch (kind) {
    case "book":
      return "Read";
    case "ticket":
      return "Open ticket";
    case "membership":
      return "Enter";
    case "portal":
      return "Enter portal";
    case "file":
      return "View file";
    case "credential":
      return "View credential";
    case "fellowship":
      return "View fellowship";
    case "office":
      return "View office";
    case "community":
      return "Enter community";
    case "subscription":
      return "Open";
    case "art":
      return "Open";
    default:
      return assertNever(kind, "collectible kind in accessVerb");
  }
}
