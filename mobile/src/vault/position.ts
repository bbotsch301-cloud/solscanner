/**
 * Where you left off.
 *
 * The whole reason the reading room exists as a place rather than a list: a member who watches
 * twenty minutes of a course, closes the app, and comes back should land at minute twenty. Losing
 * that is losing the thing that makes it a library rather than a folder of links.
 *
 * Kept per (cluster, mint) on disk, deliberately small — a number and a timestamp — so it survives
 * being killed, and so a device with a hundred items costs nothing to load. This is a convenience
 * record and nothing depends on it being right: a missing or bogus position starts from the
 * beginning, which is the same thing a member gets today.
 *
 * Separate from `property/deedHistory.ts` even though the shape rhymes. That one records what a
 * member agreed to and must never expire; this one records where a video was paused and may be
 * dropped at any time without anyone being wronged.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CLUSTER } from "../solana/connection";

const PREFIX = "vault.position.v1:";

export interface Position {
  /** Seconds into the item. */
  seconds: number;
  /** Total length in seconds, when the player knew it. Used to decide "finished". */
  duration?: number;
  /** Epoch ms of the last update, so "Continue" can order by most recently touched. */
  at: number;
}

const storageKey = (mint: string) => `${PREFIX}${CLUSTER}:${mint}`;

/**
 * Close enough to the end to count as finished.
 *
 * Resuming someone into the last few seconds of a video is worse than starting it over — they get
 * the credits and a puzzle. Anything past this reads as done and starts from zero.
 */
const FINISHED_TAIL_S = 15;

/** How far in before a position is worth keeping at all. Below this, "resume" is just noise. */
const MIN_KEEP_S = 10;

export async function loadPosition(mint: string): Promise<Position | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(mint));
    if (!raw) return null;
    const p = JSON.parse(raw) as Position;
    return typeof p?.seconds === "number" && Number.isFinite(p.seconds) ? p : null;
  } catch {
    return null;
  }
}

/**
 * Where playback should actually start, having applied the rules above.
 *
 * Returns 0 rather than null for "start at the beginning", because every caller wants a number.
 */
export async function resumeAt(mint: string): Promise<number> {
  const p = await loadPosition(mint);
  if (!p || p.seconds < MIN_KEEP_S) return 0;
  if (p.duration && p.seconds >= p.duration - FINISHED_TAIL_S) return 0;
  return p.seconds;
}

/**
 * Remember where playback got to. Never throws.
 *
 * A position below `MIN_KEEP_S` clears the record instead of storing it, so scrubbing back to the
 * start is a way to genuinely start over rather than leaving a stale marker behind.
 */
export async function savePosition(mint: string, seconds: number, duration?: number): Promise<void> {
  try {
    if (!Number.isFinite(seconds) || seconds < MIN_KEEP_S) {
      await AsyncStorage.removeItem(storageKey(mint));
      return;
    }
    const p: Position = { seconds, duration, at: Date.now() };
    await AsyncStorage.setItem(storageKey(mint), JSON.stringify(p));
  } catch {
    /* best-effort by design */
  }
}

/** Everything in progress, most recently touched first. Feeds the "Continue" shelf. */
export async function inProgress(): Promise<{ mint: string; position: Position }[]> {
  try {
    const scope = `${PREFIX}${CLUSTER}:`;
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(scope));
    if (!keys.length) return [];
    const rows = await AsyncStorage.multiGet(keys);
    const out: { mint: string; position: Position }[] = [];
    for (const [k, raw] of rows) {
      if (!raw) continue;
      try {
        const position = JSON.parse(raw) as Position;
        if (typeof position?.seconds !== "number") continue;
        // A finished item is not in progress. It stays on the shelves; it just isn't a prompt to
        // pick anything back up.
        if (position.duration && position.seconds >= position.duration - FINISHED_TAIL_S) continue;
        out.push({ mint: k.slice(scope.length), position });
      } catch {
        /* skip a corrupt entry rather than losing the rest */
      }
    }
    return out.sort((a, b) => b.position.at - a.position.at);
  } catch {
    return [];
  }
}

/** Forget one item's position — used when a key leaves the wallet. */
export async function clearPosition(mint: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(mint));
  } catch {
    /* best-effort */
  }
}
