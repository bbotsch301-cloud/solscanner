/**
 * The index of what is stored — encrypted, and living in the same directory as the files it governs.
 *
 * ## Why not AsyncStorage, where every other record in this app lives
 *
 * Because this one points at bytes. AsyncStorage and the copy directory are different durability
 * domains: on Android one is SQLite, on iOS one is a plist, and the files are neither. Anything that
 * clears the index but not the files — a future "clear cache" action, a corrupt page, a partial
 * restore — leaves gigabytes of ciphertext that **nothing knows exists**. No key reference, no deed
 * record, and no sweep that will ever touch it. That is the one failure the delete-on-loss promise
 * cannot survive, so the index sits where deleting the directory deletes both.
 *
 * `property/deedHistory.ts` uses AsyncStorage correctly, for the opposite reason: it stores a record
 * with no external referent, so losing it costs a notice and nothing else.
 *
 * ## Why it is encrypted
 *
 * It is an inventory. A plaintext list of which mints a member holds gated content for is worth
 * reading on its own, without ever opening a file — and it would survive a backup that the content
 * key does not. Same reason the filenames are hashed.
 *
 * ## Writes are serialised and atomic
 *
 * Serialised because a download finishing while a sweep runs is a real interleaving, not a
 * theoretical one, and two read-modify-writes on one blob lose an update. Atomic because `write()`
 * truncates: a kill mid-write would otherwise leave a zero-length index, which is the "files nothing
 * knows about" case arriving by a different road.
 */
import { Directory, File, Paths } from "expo-file-system";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { CLUSTER } from "../../solana/connection";
import { contentKey } from "./key";
import { bytesToHex, randomBytes } from "./crypto";
import { sha256 } from "@noble/hashes/sha2";

const ROOT_NAME = "keycopies";
const ROOT_VERSION = "v1";
const INDEX_NAME = "index.kcx";

/**
 * One stored copy.
 *
 * `state` exists so a process kill is survivable. The entry is written **before** the bytes and
 * flipped to `condemned` **before** the unlink, which means there is never a file with no entry —
 * the unsweepable case — and never an entry that outlives its file unnoticed.
 */
export interface CopyEntry {
  mint: string;
  payloadId: string;
  fileId: string;
  mime?: string;
  /**
   * Latched at download time and only ever upgraded. See `store.ts` — re-reading this from a live
   * deed would let a creator retroactively delete something already bought.
   */
  retained: boolean;
  /** The deed values the latch was taken from, kept so the decision can be audited later. */
  latchedFrom: { download?: boolean; retainedCopy?: boolean; agreementVersion?: string };
  state: "writing" | "ready" | "condemned";
  plainSize: number;
  /** sha256 of the plaintext, hex — lets a copy be checked against what was downloaded. */
  sha256: string;
  writtenAt: number;
  lastOpenedAt: number;
}

export interface Manifest {
  v: 1;
  /** Keyed by fileId, which is derivable — so any file whose name isn't a key here is an orphan. */
  entries: Record<string, CopyEntry>;
  /**
   * Consecutive "the wallet looks empty" observations.
   *
   * A rate-limited RPC returning zero token accounts is indistinguishable from a wallet that holds
   * nothing, and acting on the first one would delete a member's whole library over a bad minute of
   * connectivity. Persisted so the count survives a restart, because otherwise relaunching the app
   * resets the safety.
   */
  emptyStrikes: { count: number; lastAt: number };
}

const EMPTY: Manifest = { v: 1, entries: {}, emptyStrikes: { count: 0, lastAt: 0 } };

/**
 * The directory for one owner on one cluster.
 *
 * Computed on every call, never captured at module load: `CLUSTER` is a live binding that
 * `setNetwork` reassigns, and a root resolved once would serve one network's content for another
 * network's asset. The owner is hashed for the same reason filenames are.
 */
export function ownerDir(owner: string): Directory {
  const scope = bytesToHex(sha256(new TextEncoder().encode(owner))).slice(0, 16);
  return new Directory(Paths.document, ROOT_NAME, ROOT_VERSION, CLUSTER, scope);
}

/** Everything this module owns, for a wipe. */
export function copiesRoot(): Directory {
  return new Directory(Paths.document, ROOT_NAME);
}

export function copyFile(owner: string, fileId: string): File {
  return new File(ownerDir(owner), `${fileId}.kc`);
}

function indexFile(owner: string): File {
  return new File(ownerDir(owner), INDEX_NAME);
}

export function ensureOwnerDir(owner: string): Directory {
  const dir = ownerDir(owner);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

export async function loadManifest(owner: string): Promise<Manifest> {
  try {
    const f = indexFile(owner);
    if (!f.exists) return { ...EMPTY, entries: {} };
    const key = await contentKey();
    if (!key) return { ...EMPTY, entries: {} };

    const raw = await f.bytes();
    const nonce = raw.slice(0, 24);
    const plain = xchacha20poly1305(key, nonce).decrypt(raw.slice(24));
    const m = JSON.parse(new TextDecoder().decode(plain)) as Manifest;
    return m?.v === 1 && m.entries ? { ...EMPTY, ...m } : { ...EMPTY, entries: {} };
  } catch {
    // Unreadable, wrong key, or corrupt. An empty manifest is the safe answer: the startup pass
    // treats every file without an entry as an orphan and removes it, which is the right outcome for
    // content nothing can open anyway.
    return { ...EMPTY, entries: {} };
  }
}

async function writeManifest(owner: string, m: Manifest): Promise<void> {
  const key = await contentKey();
  if (!key) return;
  ensureOwnerDir(owner);

  const nonce = randomBytes(24);
  const sealed = xchacha20poly1305(key, nonce).encrypt(
    new TextEncoder().encode(JSON.stringify(m)),
  );
  const blob = new Uint8Array(24 + sealed.length);
  blob.set(nonce, 0);
  blob.set(sealed, 24);

  // Written beside itself and moved into place: `write()` truncates, so writing in place means a
  // kill halfway leaves a zero-length index and every file below it becomes an orphan.
  const tmp = new File(ownerDir(owner), `${INDEX_NAME}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(blob);
  const dest = indexFile(owner);
  if (dest.exists) dest.delete();
  tmp.move(dest);
}

/** Per-owner write queue. Two read-modify-writes racing on one blob would lose one of them. */
const chains = new Map<string, Promise<unknown>>();

/**
 * Read, change, and write the manifest as one operation.
 *
 * The mutation runs on a copy that is written back whatever happens, so a caller cannot leave the
 * index describing something the disk does not.
 */
export async function mutateManifest(
  owner: string,
  fn: (m: Manifest) => void | Promise<void>,
): Promise<Manifest> {
  const prior = chains.get(owner) ?? Promise.resolve();
  const next = prior.then(async () => {
    const m = await loadManifest(owner);
    await fn(m);
    await writeManifest(owner, m);
    return m;
  });
  // Keep the chain alive past a rejection, or one failure wedges every later write for this owner.
  chains.set(
    owner,
    next.catch(() => undefined),
  );
  return next;
}
