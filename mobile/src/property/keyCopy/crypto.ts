/**
 * The on-disk format for a stored copy. Pure — no filesystem, no keychain, no I/O.
 *
 * That purity is the point: this is the part where a quiet mistake is invisible and permanent, and
 * it is the only part that can be exercised outside a device. Everything here is testable and is
 * tested, including the failures that a naive round-trip test cannot see.
 *
 * ## Format v1
 *
 *   0..4    "KCP1"                     magic, plaintext — a foreign or truncated file fails fast
 *   4..5    0x01                       format version
 *   5..21   fileNonce (16 bytes)       plaintext: the HKDF salt and the per-chunk nonce prefix
 *   21..25  headerLen (uint32 LE)
 *   25..    header ciphertext          the manifest entry, sealed
 *   then    chunk 0, chunk 1, …        each ≤ CHUNK_SIZE plaintext + 16 bytes of tag
 *
 * Chunked rather than one sealed blob for two reasons. Memory: a whole file has to fit in a
 * `Uint8Array` otherwise, and a large one will not. And **random access** — with a settable file
 * offset, reading bytes `[a, b)` costs only the chunks that overlap it, so a reader that wants page
 * one of a four-hundred-page book does not decrypt four hundred pages.
 *
 * ## The part that is easy to get wrong
 *
 * Every chunk binds its **index and the total count** into the AEAD's associated data. Without that,
 * each chunk decrypts perfectly well on its own, which means chunks can be reordered, spliced in
 * from another file, or the tail simply dropped — and the reader sees valid plaintext in the wrong
 * order, or a video that ends early and looks like a bad encode. Both failures pass an
 * encrypt-then-decrypt test. They are caught only by tests that reorder and truncate deliberately,
 * which is why those tests exist.
 *
 * The header is sealed too, and carries a self-describing copy of the entry, so a lost or corrupt
 * manifest can be rebuilt from the files rather than forcing a wipe.
 */
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha2";

export const MAGIC = new Uint8Array([0x4b, 0x43, 0x50, 0x31]); // "KCP1"
export const FORMAT_VERSION = 1;
export const CHUNK_SIZE = 256 * 1024;
/** XChaCha20-Poly1305's tag. */
const TAG = 16;
const NONCE_SEED = 16;
const HEADER_LEN_OFFSET = 4 + 1 + NONCE_SEED;
export const BODY_OFFSET_BASE = HEADER_LEN_OFFSET + 4;

/** What every copy carries about itself, sealed in the header. */
export interface CopyHeader {
  v: 1;
  cluster: string;
  owner: string;
  mint: string;
  payloadId: string;
  mime?: string;
  /** Latched at download time. See the note in `store.ts` — never re-read from a live deed. */
  retained: boolean;
  plainSize: number;
  chunkSize: number;
  totalChunks: number;
  /** sha256 of the plaintext, hex. */
  sha256: string;
  writtenAt: number;
}

export class CopyFormatError extends Error {}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

/**
 * The name a copy is stored under: a hash of its identity, never the mint in the clear.
 *
 * A directory listing of plaintext mint addresses is a complete inventory of what gated content
 * someone holds — readable from a device backup *without* the key that protects the contents. So the
 * filenames are hashed too.
 *
 * Derived rather than random, which is what makes orphan detection possible: the set of legal
 * filenames is computable from the manifest alone, so anything else in the directory is garbage to
 * delete. A content-addressed name would invert that and make the index load-bearing for finding
 * files at all — and the index is precisely the thing most likely to be lost.
 */
export function fileId(cluster: string, owner: string, mint: string, payloadId = ""): string {
  return bytesToHex(sha256(enc.encode(`kc.v1|${cluster}|${owner}|${mint}|${payloadId}`))).slice(0, 32);
}

/**
 * The key one file is sealed with, derived from the device content key.
 *
 * Per-file rather than using the content key directly does two things. It domain-separates every
 * file, so a nonce-reuse mistake in one cannot touch another. And it binds the key to the file's
 * identity, so a `.kc` renamed onto another entry's filename fails to open rather than opening as
 * the wrong thing.
 */
export function fileKey(contentKey: Uint8Array, fileNonce: Uint8Array, id: string): Uint8Array {
  return hkdf(sha256, contentKey, fileNonce, enc.encode(`keycopy/v1|${id}`), 32);
}

/** Nonce for chunk `i`: the file's 16-byte seed followed by the index. Never repeats within a file. */
function nonceFor(fileNonce: Uint8Array, i: number): Uint8Array {
  const n = new Uint8Array(24);
  n.set(fileNonce, 0);
  // 64-bit little-endian index. Beyond 2^32 chunks is 2^32 * 256KiB, which is not a file.
  new DataView(n.buffer).setUint32(NONCE_SEED, i, true);
  return n;
}

/** The header gets the one nonce index no chunk can ever use. */
function headerNonce(fileNonce: Uint8Array): Uint8Array {
  const n = new Uint8Array(24);
  n.set(fileNonce, 0);
  new DataView(n.buffer).setUint32(NONCE_SEED, 0xffffffff, true);
  return n;
}

/**
 * What a chunk is authenticated against.
 *
 * Index and total, so a chunk cannot be moved, and a file cannot be truncated without the last
 * surviving chunk's total disagreeing with reality.
 */
function chunkAad(i: number, total: number): Uint8Array {
  const a = new Uint8Array(8);
  const v = new DataView(a.buffer);
  v.setUint32(0, i, true);
  v.setUint32(4, total, true);
  return a;
}

export interface SealedFrame {
  /** Everything before the first chunk: magic, version, nonce, header length, sealed header. */
  prologue: Uint8Array;
  fileNonce: Uint8Array;
  key: Uint8Array;
  totalChunks: number;
}

/** Bytes 0..N of a file, ready to write before any chunk is. */
export function sealPrologue(contentKey: Uint8Array, id: string, header: CopyHeader): SealedFrame {
  const fileNonce = randomBytes(NONCE_SEED);
  const key = fileKey(contentKey, fileNonce, id);
  const sealedHeader = xchacha20poly1305(key, headerNonce(fileNonce)).encrypt(
    enc.encode(JSON.stringify(header)),
  );

  const prologue = new Uint8Array(BODY_OFFSET_BASE + sealedHeader.length);
  prologue.set(MAGIC, 0);
  prologue[4] = FORMAT_VERSION;
  prologue.set(fileNonce, 5);
  new DataView(prologue.buffer).setUint32(HEADER_LEN_OFFSET, sealedHeader.length, true);
  prologue.set(sealedHeader, BODY_OFFSET_BASE);

  return { prologue, fileNonce, key, totalChunks: header.totalChunks };
}

/** Seal one chunk of plaintext for position `i` of `total`. */
export function sealChunk(f: SealedFrame, i: number, plain: Uint8Array): Uint8Array {
  return xchacha20poly1305(f.key, nonceFor(f.fileNonce, i), chunkAad(i, f.totalChunks)).encrypt(plain);
}

export interface OpenedFrame {
  header: CopyHeader;
  fileNonce: Uint8Array;
  key: Uint8Array;
  /** Byte offset in the file where chunk 0 begins. */
  bodyOffset: number;
}

/** Read and verify the prologue. Throws `CopyFormatError` on anything it does not recognise. */
export function openPrologue(contentKey: Uint8Array, id: string, head: Uint8Array): OpenedFrame {
  if (head.length < BODY_OFFSET_BASE) throw new CopyFormatError("truncated");
  for (let i = 0; i < MAGIC.length; i++)
    if (head[i] !== MAGIC[i]) throw new CopyFormatError("not a key copy");
  if (head[4] !== FORMAT_VERSION) throw new CopyFormatError(`unsupported version ${head[4]}`);

  const fileNonce = head.slice(5, 5 + NONCE_SEED);
  const headerLen = new DataView(head.buffer, head.byteOffset).getUint32(HEADER_LEN_OFFSET, true);
  if (head.length < BODY_OFFSET_BASE + headerLen) throw new CopyFormatError("truncated header");

  const key = fileKey(contentKey, fileNonce, id);
  let header: CopyHeader;
  try {
    const plain = xchacha20poly1305(key, headerNonce(fileNonce)).decrypt(
      head.slice(BODY_OFFSET_BASE, BODY_OFFSET_BASE + headerLen),
    );
    header = JSON.parse(dec.decode(plain)) as CopyHeader;
  } catch {
    // Wrong key, wrong filename, or tampering. Indistinguishable on purpose.
    throw new CopyFormatError("could not open header");
  }

  return { header, fileNonce, key, bodyOffset: BODY_OFFSET_BASE + headerLen };
}

/** Open one chunk. Throws if it has been altered, moved, or came from another file. */
export function openChunk(f: OpenedFrame, i: number, sealed: Uint8Array): Uint8Array {
  try {
    return xchacha20poly1305(f.key, nonceFor(f.fileNonce, i), chunkAad(i, f.header.totalChunks)).decrypt(
      sealed,
    );
  } catch {
    throw new CopyFormatError(`chunk ${i} failed authentication`);
  }
}

/** Where chunk `i` starts in the file, and how long it is on disk. */
export function chunkExtent(f: OpenedFrame, i: number): { start: number; length: number } {
  const sealedChunk = f.header.chunkSize + TAG;
  const start = f.bodyOffset + i * sealedChunk;
  const isLast = i === f.header.totalChunks - 1;
  if (!isLast) return { start, length: sealedChunk };
  const tail = f.header.plainSize - i * f.header.chunkSize;
  return { start, length: tail + TAG };
}

/** How many chunks a plaintext of this size becomes. Zero-length content is one empty chunk. */
export function chunkCount(plainSize: number, chunkSize = CHUNK_SIZE): number {
  return Math.max(1, Math.ceil(plainSize / chunkSize));
}

/** Total size on disk, so free space can be checked before a byte is written. */
export function sealedSize(plainSize: number, headerLen: number, chunkSize = CHUNK_SIZE): number {
  return BODY_OFFSET_BASE + headerLen + plainSize + chunkCount(plainSize, chunkSize) * TAG;
}

export function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(a);
  return a;
}
