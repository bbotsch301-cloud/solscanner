/**
 * The on-disk copy format.
 *
 * `crypto.ts` claimed these tests existed. They did not — the repository had no test files at all,
 * so the format's defences against reordering, splicing and truncation had never been exercised.
 * This is that claim made true.
 *
 * The point of every test below the round trip: **each of these failures decrypts cleanly under a
 * naive implementation.** A chunk moved to another index, a chunk lifted from a different file, a
 * file with its tail dropped — all produce valid-looking plaintext if position, identity and count
 * aren't bound in. An encrypt-then-decrypt test passes throughout. So these tests deliberately
 * construct the broken states rather than round-tripping the good one.
 *
 * ## What these tests were measured to catch
 *
 * A green suite proves nothing until you know it can go red, so each defence in `crypto.ts` was
 * removed in turn and the suite re-run. Recorded here so the next person doesn't have to redo it:
 *
 *   | mutation                                   | result                                    |
 *   |--------------------------------------------|-------------------------------------------|
 *   | drop the TOTAL from the chunk AAD          | ✅ caught — "different total" fails        |
 *   | make `fileKey` ignore the filename id      | ✅ caught — "renamed onto another" fails   |
 *   | drop the INDEX from the chunk AAD          | ❌ not caught — all 18 still pass          |
 *   | make the nonce ignore the chunk index      | ❌ not caught — all 18 still pass          |
 *   | remove the AAD entirely                    | ✅ caught, but ONLY the "different total"  |
 *
 * The two misses are not gaps in these tests — they are the same property defended twice. Reordering
 * is refused by the nonce AND by the AAD index, so removing either one alone leaves the other doing
 * the job and nothing can observe the difference from outside. That redundancy is worth keeping and
 * worth knowing about: it means the reorder test below proves reordering is refused, but cannot say
 * which mechanism refused it.
 *
 * The last row is the load-bearing one. It says the associated data earns its place for exactly one
 * attack — re-counting — and that the module's own description of itself used to over-credit it.
 */
import { describe, expect, it } from "vitest";
import {
  BODY_OFFSET_BASE,
  CopyFormatError,
  FORMAT_VERSION,
  MAGIC,
  chunkCount,
  chunkExtent,
  fileId,
  openChunk,
  openPrologue,
  randomBytes,
  sealChunk,
  sealPrologue,
  sealedSize,
  type CopyHeader,
} from "./crypto";

/** Small chunks so a test file is a few hundred bytes. The format takes sizes from the header. */
const CHUNK = 64;
const TAG = 16;

const KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);
const ID = fileId("devnet", "OwnerAddress", "MintAddress");

function header(plainSize: number, over: Partial<CopyHeader> = {}): CopyHeader {
  return {
    v: 1,
    cluster: "devnet",
    owner: "OwnerAddress",
    mint: "MintAddress",
    payloadId: "p1",
    retained: false,
    plainSize,
    chunkSize: CHUNK,
    totalChunks: chunkCount(plainSize, CHUNK),
    sha256: "00".repeat(32),
    writtenAt: 1_700_000_000_000,
    ...over,
  };
}

/** Seal `plain` into a complete file, returning the bytes and the pieces a reader needs. */
function seal(plain: Uint8Array, key = KEY, id = ID) {
  const h = header(plain.length);
  const frame = sealPrologue(key, id, h);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < h.totalChunks; i++) {
    chunks.push(sealChunk(frame, i, plain.subarray(i * CHUNK, (i + 1) * CHUNK)));
  }
  const total = frame.prologue.length + chunks.reduce((n, c) => n + c.length, 0);
  const file = new Uint8Array(total);
  file.set(frame.prologue, 0);
  let at = frame.prologue.length;
  for (const c of chunks) {
    file.set(c, at);
    at += c.length;
  }
  return { file, chunks, header: h, prologueLen: frame.prologue.length };
}

const body = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("round trip", () => {
  it("returns every chunk unchanged", () => {
    const plain = body(CHUNK * 3 + 17); // four chunks, last one partial
    const { file, chunks, header: h } = seal(plain);
    expect(h.totalChunks).toBe(4);

    const f = openPrologue(KEY, ID, file);
    expect(f.header.plainSize).toBe(plain.length);

    const out: number[] = [];
    for (let i = 0; i < h.totalChunks; i++) out.push(...openChunk(f, i, chunks[i]));
    expect(Uint8Array.from(out)).toEqual(plain);
  });

  it("handles zero-length content as one empty chunk", () => {
    const { file, chunks, header: h } = seal(new Uint8Array(0));
    expect(h.totalChunks).toBe(1);
    const f = openPrologue(KEY, ID, file);
    expect(openChunk(f, 0, chunks[0]).length).toBe(0);
  });
});

describe("the failures a round trip cannot see", () => {
  it("refuses a chunk moved to another index", () => {
    // Reordering is the attack that produces a readable book with its pages shuffled. Refused twice
    // over — by the nonce and by the AAD index — so this asserts the outcome, not the mechanism.
    const { file, chunks } = seal(body(CHUNK * 3));
    const f = openPrologue(KEY, ID, file);

    expect(() => openChunk(f, 0, chunks[1])).toThrow(CopyFormatError);
    expect(() => openChunk(f, 2, chunks[0])).toThrow(CopyFormatError);
    // ...and the honest position still opens, so the rejection is about position, not damage.
    expect(() => openChunk(f, 1, chunks[1])).not.toThrow();
  });

  it("refuses a chunk spliced in from another file", () => {
    const mine = seal(body(CHUNK * 2));
    const theirs = seal(body(CHUNK * 2), KEY, fileId("devnet", "OwnerAddress", "DifferentMint"));

    const f = openPrologue(KEY, ID, mine.file);
    expect(() => openChunk(f, 0, theirs.chunks[0])).toThrow(CopyFormatError);
  });

  it("refuses chunks whose file claimed a different total", () => {
    // Truncation dressed up as a complete file: take the first chunks of a long file and present
    // them as a short one. The count is bound into the AAD, so the chunk no longer authenticates.
    // This is the ONLY test that fails when the AAD is removed — it is what the AAD is actually for.
    const { file, chunks } = seal(body(CHUNK * 4));
    const f = openPrologue(KEY, ID, file);
    const shortened = { ...f, header: { ...f.header, totalChunks: 2 } };

    expect(() => openChunk(shortened, 0, chunks[0])).toThrow(CopyFormatError);
  });

  it("refuses a tampered chunk", () => {
    const { file, chunks } = seal(body(CHUNK));
    const f = openPrologue(KEY, ID, file);
    const bent = Uint8Array.from(chunks[0]);
    bent[0] ^= 0x01;
    expect(() => openChunk(f, 0, bent)).toThrow(CopyFormatError);
  });
});

describe("the prologue", () => {
  it("refuses the wrong content key", () => {
    const { file } = seal(body(CHUNK));
    expect(() => openPrologue(OTHER_KEY, ID, file)).toThrow(CopyFormatError);
  });

  it("refuses a file renamed onto another entry's filename", () => {
    // The key is derived from the id, so a `.kc` moved to a different name fails to open rather
    // than opening as the wrong thing.
    const { file } = seal(body(CHUNK));
    expect(() => openPrologue(KEY, fileId("devnet", "OwnerAddress", "OtherMint"), file)).toThrow(
      CopyFormatError,
    );
  });

  it("refuses foreign bytes, a wrong version, and a truncated head", () => {
    const { file } = seal(body(CHUNK));

    const foreign = Uint8Array.from(file);
    foreign[0] = MAGIC[0] ^ 0xff;
    expect(() => openPrologue(KEY, ID, foreign)).toThrow(/not a key copy/);

    const future = Uint8Array.from(file);
    future[4] = FORMAT_VERSION + 1;
    expect(() => openPrologue(KEY, ID, future)).toThrow(/unsupported version/);

    expect(() => openPrologue(KEY, ID, file.slice(0, BODY_OFFSET_BASE - 1))).toThrow(/truncated/);
  });

  it("refuses a tampered header", () => {
    const { file } = seal(body(CHUNK));
    const bent = Uint8Array.from(file);
    bent[BODY_OFFSET_BASE] ^= 0x01;
    expect(() => openPrologue(KEY, ID, bent)).toThrow(CopyFormatError);
  });
});

describe("filenames", () => {
  it("are deterministic and distinct per identity", () => {
    expect(fileId("devnet", "o", "m")).toBe(fileId("devnet", "o", "m"));
    const ids = new Set([
      fileId("devnet", "o", "m"),
      fileId("mainnet-beta", "o", "m"),
      fileId("devnet", "other", "m"),
      fileId("devnet", "o", "other"),
      fileId("devnet", "o", "m", "payload2"),
    ]);
    expect(ids.size).toBe(5);
  });

  it("never contain the mint in the clear", () => {
    // A directory listing is otherwise a complete inventory of what gated content someone holds,
    // readable from a device backup WITHOUT the key that protects the contents.
    expect(fileId("devnet", "OwnerAddress", "MintAddress")).not.toContain("MintAddress");
  });
});

describe("sizes and offsets", () => {
  it("counts chunks, treating empty as one", () => {
    expect(chunkCount(0, CHUNK)).toBe(1);
    expect(chunkCount(1, CHUNK)).toBe(1);
    expect(chunkCount(CHUNK, CHUNK)).toBe(1); // exact multiple, not two
    expect(chunkCount(CHUNK + 1, CHUNK)).toBe(2);
    expect(chunkCount(CHUNK * 4, CHUNK)).toBe(4);
  });

  it("locates every chunk, including a partial tail", () => {
    const plain = body(CHUNK * 2 + 5);
    const { file, prologueLen } = seal(plain);
    const f = openPrologue(KEY, ID, file);

    expect(chunkExtent(f, 0)).toEqual({ start: prologueLen, length: CHUNK + TAG });
    expect(chunkExtent(f, 1)).toEqual({ start: prologueLen + CHUNK + TAG, length: CHUNK + TAG });
    expect(chunkExtent(f, 2).length).toBe(5 + TAG); // the remainder, not a full chunk
  });

  it("gives a full-length final chunk when the size is an exact multiple", () => {
    const { file } = seal(body(CHUNK * 2));
    const f = openPrologue(KEY, ID, file);
    expect(chunkExtent(f, 1).length).toBe(CHUNK + TAG);
  });

  it("predicts the file size before a byte is written", () => {
    // This is what free space is checked against, so being wrong means a download that dies part-way.
    for (const size of [0, 1, CHUNK, CHUNK + 1, CHUNK * 3 + 9]) {
      const { file, prologueLen } = seal(body(size));
      const headerLen = prologueLen - BODY_OFFSET_BASE;
      expect(sealedSize(size, headerLen, CHUNK)).toBe(file.length);
    }
  });

  it("reads a chunk at the offset chunkExtent reports", () => {
    // The two halves have to agree, or random access silently reads the wrong bytes.
    const plain = body(CHUNK * 3 + 1);
    const { file } = seal(plain);
    const f = openPrologue(KEY, ID, file);

    for (let i = 0; i < f.header.totalChunks; i++) {
      const { start, length } = chunkExtent(f, i);
      const got = openChunk(f, i, file.slice(start, start + length));
      expect(got).toEqual(plain.subarray(i * CHUNK, i * CHUNK + got.length));
    }
  });
});

describe("randomBytes", () => {
  it("returns the requested length and does not repeat", () => {
    expect(randomBytes(24).length).toBe(24);
    expect(randomBytes(16)).not.toEqual(randomBytes(16));
  });
});
