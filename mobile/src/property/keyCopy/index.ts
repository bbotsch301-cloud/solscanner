/**
 * Local copies of gated content, on the terms the deed set.
 *
 * The one entry point screens should use. Everything below it is deliberately separate: `policy.ts`
 * and `crypto.ts` are pure and are the parts that get tested; `key.ts`, `manifest.ts`, `store.ts` and
 * `sweep.ts` touch the keychain and the filesystem and can only be checked on a device.
 */
export { copyPolicy, describeCopy, explainPolicy, permitsCopy, type CopyPolicy } from "./policy";
export { findCopy, listCopies, readCopy, readRange, deleteCopy, type CopyRef, type SaveResult } from "./store";
export { onKeyLost, preloadKeyCopies, purgeOwner, reconcileHoldings, panicRotate } from "./sweep";
export type { CopyEntry } from "./manifest";

import type { Collectible } from "../../solana/collectibles";
import type { Deed } from "../deed";
import { saveCopy } from "./store";

/**
 * Store a copy of what was just unlocked, if the deed allows it.
 *
 * Called with the grant already in hand, so it costs no extra proof of ownership — the member has
 * just proved it to open the thing. Never throws and never blocks: a member opening a book should
 * not wait on a download, and a copy that fails to save costs nothing but needing a connection next
 * time.
 */
export async function keepCopyIfPermitted(
  item: Collectible,
  owner: string,
  url: string,
  deed: Deed | null,
  mime: string | undefined,
): Promise<void> {
  try {
    await saveCopy({ owner, mint: item.mint }, url, deed, { mime });
  } catch {
    /* an absent copy is a slower open, not a broken one */
  }
}
