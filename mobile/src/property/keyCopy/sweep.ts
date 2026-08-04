/**
 * Deleting a copy when the key that justified it is gone.
 *
 * Four triggers, because every one of them alone leaves a hole:
 *
 *  1. **The transfer this app performed** — hooked inside `removeCollectible`, so it cannot be
 *     forgotten at a new call site.
 *  2. **Reconciliation after a successful holdings fetch** — the only trigger that catches a transfer
 *     made from another wallet, a CLI, or a marketplace. This app is not the only thing that can move
 *     a key.
 *  3. **Startup** — cleanup, not sweeping: finish condemned deletions, drop half-written entries,
 *     remove orphan files, and handle a device restored without its key.
 *  4. **Wallet removal and reset**, which purge outright.
 *
 * Deliberately **not** a background task. Expo offers no reliable background execution here, and a
 * promise that depends on the OS's scheduling mood is not a promise. Better to say so than to imply
 * a sweep runs while the app is closed.
 *
 * ## The guard that matters more than the sweep
 *
 * A failed network call used to be indistinguishable from an empty wallet — `fetchCollectibles`
 * returns the cached list from its `catch`. Deleting on the strength of that would wipe a library
 * over one bad minute of connectivity. So reconciliation takes a `Holdings` and refuses to act
 * unless the chain actually answered.
 *
 * Even a successful answer of *zero* is treated with suspicion: a rate-limited RPC returning no token
 * accounts looks exactly like a wallet that holds nothing. Two consecutive empty observations, ten
 * minutes apart, are required before anything is deleted — and the counter lives in the manifest, so
 * relaunching the app does not reset the safety.
 */
import { Directory } from "expo-file-system";
import type { Holdings } from "../../solana/collectibles";
import { clearPosition } from "../../vault/position";
import { hasContentKey, rotateContentKey } from "./key";
import { copiesRoot, copyFile, loadManifest, mutateManifest, ownerDir } from "./manifest";
import { dropEntry } from "./store";

/** Two of these, this far apart, before an empty wallet is believed. */
const EMPTY_STRIKES_REQUIRED = 2;
const EMPTY_STRIKE_GAP_MS = 10 * 60 * 1000;

/**
 * A key has left this wallet. Drop what it justified.
 *
 * **A retained copy survives this unconditionally**, and that is not a detail. `removeCollectible`
 * fires optimistically, before the chain confirms — so a dropped transaction would otherwise destroy
 * a copy the member still owns. And even on a real transfer, a retained copy is exactly the thing the
 * member bought the right to keep: they sold the key, not their copy.
 */
export async function onKeyLost(owner: string, mint: string): Promise<void> {
  try {
    const m = await loadManifest(owner);
    for (const e of Object.values(m.entries)) {
      if (e.mint !== mint || e.retained) continue;
      await dropEntry(owner, e.fileId, { deleteFile: true });
    }
    // Where they were in something they no longer hold is not worth keeping either.
    await clearPosition(mint);
  } catch {
    /* the next reconciliation or startup pass catches it */
  }
}

/**
 * Compare what is stored against what the wallet actually holds.
 *
 * Does nothing at all unless the chain answered — see the note above.
 */
export async function reconcileHoldings(owner: string, holdings: Holdings): Promise<void> {
  if (!holdings.ok) return;

  try {
    const held = new Set(holdings.items.map((c) => c.mint));
    const m = await loadManifest(owner);
    const stored = Object.values(m.entries).filter((e) => e.state === "ready" && !e.retained);
    if (stored.length === 0) {
      await resetStrikes(owner);
      return;
    }

    if (held.size === 0) {
      // A successful-looking empty. Count it, and act only if it happens twice, far enough apart
      // that a single rate-limited window cannot produce both.
      const now = Date.now();
      const strikes = await mutateManifest(owner, (mm) => {
        const s = mm.emptyStrikes;
        mm.emptyStrikes =
          s.lastAt > 0 && now - s.lastAt < EMPTY_STRIKE_GAP_MS
            ? s // too soon to count as independent evidence
            : { count: s.count + 1, lastAt: now };
      }).then((mm) => mm.emptyStrikes.count);
      if (strikes < EMPTY_STRIKES_REQUIRED) return;
    } else {
      await resetStrikes(owner);
    }

    for (const e of stored) {
      if (held.has(e.mint)) continue;
      await dropEntry(owner, e.fileId, { deleteFile: true });
      await clearPosition(e.mint);
    }
  } catch {
    /* best-effort; startup and the next refresh both try again */
  }
}

async function resetStrikes(owner: string): Promise<void> {
  await mutateManifest(owner, (m) => {
    if (m.emptyStrikes.count !== 0) m.emptyStrikes = { count: 0, lastAt: 0 };
  }).catch(() => undefined);
}

/**
 * Startup: finish what was interrupted, and clean up what nothing owns.
 *
 * Explicitly **not** a sweep against holdings. There is no trustworthy holdings list at startup —
 * the snapshot can be a week old — so deleting on the strength of it would be deleting on the
 * strength of stale data. Sweeping waits for the first real fetch.
 */
export async function preloadKeyCopies(owners: string[]): Promise<void> {
  try {
    const root = copiesRoot();
    if (!root.exists) return;

    // A device restored from backup gets the files (they live in Documents) without the key (it does
    // not — WHEN_UNLOCKED_THIS_DEVICE_ONLY). That leaves undecryptable ciphertext which nothing will
    // ever open and, for retained entries, nothing will ever sweep. Wipe it rather than let someone
    // wonder where their storage went.
    if (!(await hasContentKey())) {
      try {
        root.delete();
      } catch {
        /* nothing else to try */
      }
      await rotateContentKey();
      return;
    }

    for (const owner of owners) await cleanOwner(owner);
  } catch {
    /* never block startup on housekeeping */
  }
}

async function cleanOwner(owner: string): Promise<void> {
  const dir = ownerDir(owner);
  if (!dir.exists) return;

  const m = await loadManifest(owner);

  // Deletions that were marked but may not have completed, and writes that never finished.
  for (const e of Object.values(m.entries)) {
    if (e.state === "condemned" || e.state === "writing")
      await dropEntry(owner, e.fileId, { deleteFile: true });
  }

  // Anything on disk the index does not account for. Possible because `fileId` is derived rather
  // than random: the set of legal names is computable, so everything else is garbage — an
  // interrupted move, a partial restore, a manifest that had to be discarded.
  const legal = new Set(Object.keys(m.entries).map((id) => `${id}.kc`));
  legal.add("index.kcx");
  for (const child of dir.list()) {
    if (child instanceof Directory) continue;
    if (legal.has(child.name)) continue;
    try {
      child.delete();
    } catch {
      /* skip; next launch tries again */
    }
  }
}

/** Erasing a wallet must not leave its content behind. */
export async function purgeOwner(owner: string): Promise<void> {
  try {
    const m = await loadManifest(owner);
    for (const e of Object.values(m.entries)) await clearPosition(e.mint);
    const dir = ownerDir(owner);
    if (dir.exists) dir.delete();
  } catch {
    /* fall through to the caller's rotate, which is the real backstop */
  }
}

/**
 * The last resort: make every copy on this device permanently unopenable, at once.
 *
 * Used by a full reset. This is the only deletion guaranteed to have taken effect even if every
 * single unlink failed, because it removes the key rather than the bytes.
 */
export async function panicRotate(): Promise<void> {
  try {
    const root = copiesRoot();
    if (root.exists) root.delete();
  } catch {
    /* the rotate below is what actually makes it safe */
  }
  await rotateContentKey();
}

/** Re-exported so callers don't need to know the file a copy lives in. */
export { copyFile };
