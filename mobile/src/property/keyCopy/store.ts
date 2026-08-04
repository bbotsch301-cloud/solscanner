/**
 * Keeping a copy of something you own, on the terms its deed set.
 *
 * ## What this can honestly claim
 *
 * The app keeps **its own** side of the deed exactly: it stores nothing the deed didn't permit, it
 * stores it where no other app can read it, it encrypts it so a backup or a lifted filesystem yields
 * nothing, and it deletes it when the key that justified it leaves the wallet.
 *
 * It cannot claim more, and no interface built on it may. **A downloaded file cannot be
 * un-downloaded.** A rooted device, a screen recorder, or a camera pointed at the screen defeats all
 * of this, and a member determined to keep something will keep it. This is a mechanism for honest
 * cases — which is what a deed is too. `Retained Copy: No` is a term of an agreement, and this is the
 * app honouring it, not a lock preventing its breach.
 *
 * ## The latch
 *
 * `retained` is decided **once**, when the file is written, and afterwards only ever upgrades.
 *
 * The issuer keeps metadata update authority — the whole premise of `deedHistory.ts` — so a deed can
 * flip `Retained Copy: Yes` to `No` at any time. Honouring that flip would let a creator retroactively
 * delete something a member already bought and paid for under the earlier terms. So the tier is
 * latched at download with the deed values it came from, and a later `true` promotes an existing copy
 * while a later `false` does not demote it. Anyone who "simplifies" this by re-reading the deed at
 * sweep time reopens exactly the silent-rewrite hole that module exists to close.
 *
 * ## Writing without ever putting plaintext on disk
 *
 * Two paths, chosen at runtime rather than by guessing what the platform supports. If `fetch` hands
 * back a readable body, chunks are encrypted as they arrive and written straight through — bounded
 * memory, nothing unencrypted anywhere. If it doesn't, the response is buffered in memory and sealed
 * there. Neither writes a plaintext file, which is why `downloadFileAsync` is not used at all: it
 * would write the content in the clear and leave a deleted-but-recoverable extent behind it.
 *
 * The in-memory fallback is bounded by `shouldStoreLocally` in `policy.ts` — large media is never a
 * local copy in the first place, because the app caches the *entitlement* for those instead.
 */
import { File, Paths } from "expo-file-system";
import { sha256 } from "@noble/hashes/sha2";
import type { Deed } from "../deed";
import { contentKey } from "./key";
import {
  CHUNK_SIZE,
  CopyFormatError,
  bytesToHex,
  chunkCount,
  chunkExtent,
  fileId as deriveFileId,
  openChunk,
  openPrologue,
  sealChunk,
  sealPrologue,
  type CopyHeader,
} from "./crypto";
import { copyPolicy, shouldStoreLocally, type CopyPolicy } from "./policy";
import {
  copyFile,
  ensureOwnerDir,
  loadManifest,
  mutateManifest,
  ownerDir,
  type CopyEntry,
} from "./manifest";
import { CLUSTER } from "../../solana/connection";

/** Never fill someone's phone for them. */
const MIN_FREE_BYTES = 512 * 1024 * 1024;
/** Budget over ephemeral copies only — a retained one is neither evicted nor counted. */
const MAX_EVICTABLE_BYTES = 2 * 1024 * 1024 * 1024;

export interface CopyRef {
  owner: string;
  mint: string;
  payloadId?: string;
}

const idFor = (r: CopyRef) => deriveFileId(CLUSTER, r.owner, r.mint, r.payloadId ?? "");

/** The copy this wallet holds for an asset, if any and if it is readable. */
export async function findCopy(ref: CopyRef): Promise<CopyEntry | null> {
  const m = await loadManifest(ref.owner);
  const e = m.entries[idFor(ref)];
  return e && e.state === "ready" ? e : null;
}

export async function listCopies(owner: string): Promise<CopyEntry[]> {
  const m = await loadManifest(owner);
  return Object.values(m.entries).filter((e) => e.state === "ready");
}

/**
 * Store a copy, if the deed permits one and it is worth keeping.
 *
 * Returns the reason it didn't rather than throwing, because "the deed doesn't allow this" is a
 * normal answer that the interface has to be able to explain, not an error.
 */
export type SaveResult =
  | { ok: true; entry: CopyEntry }
  | { ok: false; reason: "policy" | "too-large" | "no-key" | "no-space" | "failed"; policy: CopyPolicy };

export async function saveCopy(
  ref: CopyRef,
  url: string,
  deed: Deed | null,
  opts: { mime?: string; expectedSize?: number | null } = {},
): Promise<SaveResult> {
  const policy = copyPolicy(deed);
  if (policy.kind === "stream-only") return { ok: false, reason: "policy", policy };
  if (!shouldStoreLocally(opts.mime, opts.expectedSize ?? null))
    return { ok: false, reason: "too-large", policy };

  const key = await contentKey();
  if (!key) return { ok: false, reason: "no-key", policy };

  const id = idFor(ref);
  const retained = policy.kind === "retained";

  // The entry lands before a single byte does. A kill between the two leaves a `writing` entry that
  // startup cleans up; the reverse order would leave a file nothing knows about.
  await mutateManifest(ref.owner, (m) => {
    m.entries[id] = {
      mint: ref.mint,
      payloadId: ref.payloadId ?? "",
      fileId: id,
      mime: opts.mime,
      retained,
      latchedFrom: {
        download: deed?.rights.download,
        retainedCopy: deed?.rights.retainedCopy,
        agreementVersion: deed?.agreementVersion,
      },
      state: "writing",
      plainSize: 0,
      sha256: "",
      writtenAt: Date.now(),
      lastOpenedAt: Date.now(),
    };
  });

  try {
    await evictIfNeeded(ref.owner, opts.expectedSize ?? 0);
    if (Paths.availableDiskSpace < MIN_FREE_BYTES) {
      await dropEntry(ref.owner, id);
      return { ok: false, reason: "no-space", policy };
    }

    const written = await writeSealed(ref, id, url, key, retained, opts.mime);

    const entry = await mutateManifest(ref.owner, (m) => {
      const e = m.entries[id];
      if (!e) return;
      e.state = "ready";
      e.plainSize = written.plainSize;
      e.sha256 = written.sha256;
      e.writtenAt = Date.now();
      e.lastOpenedAt = Date.now();
    }).then((m) => m.entries[id]);

    return entry ? { ok: true, entry } : { ok: false, reason: "failed", policy };
  } catch {
    await dropEntry(ref.owner, id, { deleteFile: true });
    return { ok: false, reason: "failed", policy };
  }
}

/** Fetch, seal and write. Never lets plaintext touch the filesystem. */
async function writeSealed(
  ref: CopyRef,
  id: string,
  url: string,
  key: Uint8Array,
  retained: boolean,
  mime: string | undefined,
): Promise<{ plainSize: number; sha256: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status}`);

  ensureOwnerDir(ref.owner);
  const dest = new File(ownerDir(ref.owner), `${id}.kc.tmp`);
  if (dest.exists) dest.delete();
  dest.create();

  // Whether this platform gives a streaming body is a runtime fact, not something to assume. Both
  // paths end with the same sealed bytes; only the peak memory differs.
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  const plain = typeof body?.getReader === "function"
    ? await collectStream(body)
    : new Uint8Array(await res.arrayBuffer());

  const total = chunkCount(plain.length);
  const header: CopyHeader = {
    v: 1,
    cluster: CLUSTER,
    owner: ref.owner,
    mint: ref.mint,
    payloadId: ref.payloadId ?? "",
    mime,
    retained,
    plainSize: plain.length,
    chunkSize: CHUNK_SIZE,
    totalChunks: total,
    sha256: bytesToHex(sha256(plain)),
    writtenAt: Date.now(),
  };

  const frame = sealPrologue(key, id, header);
  const handle = dest.open();
  try {
    handle.writeBytes(frame.prologue);
    for (let i = 0; i < total; i++)
      handle.writeBytes(sealChunk(frame, i, plain.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)));
  } finally {
    // Android holds an open file, and a leaked handle turns a later delete into an intermittent
    // failure — the worst kind to diagnose.
    handle.close();
  }

  const final = copyFile(ref.owner, id);
  if (final.exists) final.delete();
  dest.move(final);

  return { plainSize: plain.length, sha256: header.sha256 };
}

async function collectStream(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      size += value.length;
    }
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Read a stored copy back, whole or in part.
 *
 * `readRange` is what makes chunking pay: a reader that wants the first pages of a large book
 * decrypts only the chunks that overlap them, rather than the whole file. Nothing consumes it yet —
 * every media surface in React Native takes a URI, not a stream — but the format supports seeking, so
 * a future in-app reader is an addition rather than a re-encrypt.
 */
export async function readCopy(ref: CopyRef): Promise<Uint8Array | null> {
  const e = await findCopy(ref);
  if (!e) return null;
  return readRange(ref, 0, e.plainSize);
}

export async function readRange(ref: CopyRef, start: number, end: number): Promise<Uint8Array | null> {
  const key = await contentKey();
  if (!key) return null;

  const id = idFor(ref);
  const f = copyFile(ref.owner, id);
  if (!f.exists) return null;

  const handle = f.open();
  try {
    // Enough to cover the prologue: magic, version, nonce, length, and a sealed header.
    handle.offset = 0;
    const head = handle.readBytes(Math.min(8192, handle.size ?? 8192));
    const frame = openPrologue(key, id, head);

    const from = Math.max(0, start);
    const to = Math.min(end, frame.header.plainSize);
    if (to <= from) return new Uint8Array(0);

    const first = Math.floor(from / frame.header.chunkSize);
    const last = Math.floor((to - 1) / frame.header.chunkSize);

    const out = new Uint8Array(to - from);
    let at = 0;
    for (let i = first; i <= last; i++) {
      const ext = chunkExtent(frame, i);
      handle.offset = ext.start;
      const plain = openChunk(frame, i, handle.readBytes(ext.length));
      const chunkStart = i * frame.header.chunkSize;
      const sliceFrom = Math.max(0, from - chunkStart);
      const sliceTo = Math.min(plain.length, to - chunkStart);
      out.set(plain.subarray(sliceFrom, sliceTo), at);
      at += sliceTo - sliceFrom;
    }

    void touch(ref.owner, id);
    return out;
  } catch (e) {
    // A file that fails to open is a file that will never open — wrong key, corrupt, or tampered.
    // Leaving it costs disk and confuses the orphan pass, so it goes.
    if (e instanceof CopyFormatError) await dropEntry(ref.owner, id, { deleteFile: true });
    return null;
  } finally {
    handle.close();
  }
}

/** LRU wants a read time, and the filesystem's mtime says nothing about reads. */
async function touch(owner: string, id: string): Promise<void> {
  await mutateManifest(owner, (m) => {
    const e = m.entries[id];
    if (e) e.lastOpenedAt = Date.now();
  }).catch(() => undefined);
}

export async function deleteCopy(ref: CopyRef, opts: { force?: boolean } = {}): Promise<boolean> {
  const id = idFor(ref);
  const m = await loadManifest(ref.owner);
  const e = m.entries[id];
  if (!e) return false;
  // A retained copy is deletable by the member and never by the app. `force` is the member.
  if (e.retained && !opts.force) return false;
  await dropEntry(ref.owner, id, { deleteFile: true });
  return true;
}

/**
 * Remove an entry, and its file if asked.
 *
 * Condemn first, then unlink. A kill after the mark leaves an entry startup re-deletes before
 * anything can open it; a kill before it is caught by the next reconciliation. The window is never
 * "forever" — it is bounded by the next launch or the next refresh, whichever lands first.
 */
export async function dropEntry(
  owner: string,
  id: string,
  opts: { deleteFile?: boolean } = {},
): Promise<void> {
  if (opts.deleteFile) {
    await mutateManifest(owner, (m) => {
      const e = m.entries[id];
      if (e) e.state = "condemned";
    }).catch(() => undefined);
    try {
      const f = copyFile(owner, id);
      if (f.exists) f.delete();
    } catch {
      // The entry stays condemned, so startup tries again. A failed unlink is not a lost promise.
      return;
    }
  }
  await mutateManifest(owner, (m) => {
    delete m.entries[id];
  }).catch(() => undefined);
}

/**
 * Make room for an incoming file, oldest-read first.
 *
 * Retained copies are neither evicted nor counted against the budget. Both halves matter: evicting
 * one breaks the exact promise it was bought under, and counting one would let a large retained file
 * push out an unrelated ephemeral one — a coupling nobody would predict from reading the code.
 */
async function evictIfNeeded(owner: string, incoming: number): Promise<void> {
  const m = await loadManifest(owner);
  const evictable = Object.values(m.entries)
    .filter((e) => e.state === "ready" && !e.retained)
    .sort((a, b) => a.lastOpenedAt - b.lastOpenedAt);

  let used = evictable.reduce((n, e) => n + e.plainSize, 0);
  for (const e of evictable) {
    if (used + incoming <= MAX_EVICTABLE_BYTES) break;
    await dropEntry(owner, e.fileId, { deleteFile: true });
    used -= e.plainSize;
  }
}
