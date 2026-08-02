/**
 * Disk-backed "last known good" snapshots, so a cold app open paints real data INSTANTLY instead of
 * zeros or an empty skeleton while the network round-trips.
 *
 * This is the generalisation of `wallet/snapshotCache.ts`, which already did exactly this for
 * balances: one AsyncStorage entry per scope, a warm in-memory Map preloaded once at startup so the
 * first render can read it SYNCHRONOUSLY, best-effort write-through, and a max age beyond which a
 * snapshot is ignored (very stale numbers mislead more than a skeleton does).
 *
 * `snapshotCache.ts` is deliberately left alone — it works, and the wallet tab depends on it. New
 * caches build on this factory instead.
 *
 * Scopes must be network-aware where it matters (e.g. `mainnet-beta:<address>`), so devnet and
 * mainnet never seed each other.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** What's stored on disk: the payload plus when it was written. */
interface Stamped<T> {
  ts: number;
  v: T;
}

export interface DiskSnapshot<T> {
  /** Load every persisted entry into memory. Call once at startup, before rendering. */
  preload(): Promise<void>;
  /** Synchronously read a fresh-enough snapshot for instant seeding, or undefined. */
  get(scope: string): T | undefined;
  /** Like `get`, but also reports when it was captured — for "updated 5m ago" style copy. */
  getStamped(scope: string): { value: T; ts: number } | undefined;
  /** Write-through: update the warm map and persist (fire-and-forget). */
  set(scope: string, value: T): void;
}

/**
 * @param prefix  AsyncStorage key prefix, versioned (e.g. `"eco.snap.v1:"`). Bump the version to
 *                invalidate every stored entry after a shape change.
 * @param maxAgeMs How old a snapshot may be and still be worth showing.
 */
export function createDiskSnapshot<T>(prefix: string, maxAgeMs: number): DiskSnapshot<T> {
  const warm = new Map<string, Stamped<T>>();

  // Plain closures rather than object methods: callers routinely destructure these
  // (`const { get } = ecoSnapshots`), which would strip `this`.
  const preload = async (): Promise<void> => {
    try {
      const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(prefix));
      if (!keys.length) return;
      for (const [k, raw] of await AsyncStorage.multiGet(keys)) {
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw) as Stamped<T>;
          if (parsed && typeof parsed.ts === "number") warm.set(k.slice(prefix.length), parsed);
        } catch {
          /* skip a corrupt entry */
        }
      }
    } catch {
      /* best-effort: a missing cache only costs us the instant paint */
    }
  };

  const getStamped = (scope: string): { value: T; ts: number } | undefined => {
    const s = warm.get(scope);
    if (!s || Date.now() - s.ts > maxAgeMs) return undefined;
    return { value: s.v, ts: s.ts };
  };

  const get = (scope: string): T | undefined => getStamped(scope)?.value;

  const set = (scope: string, value: T): void => {
    const stamped: Stamped<T> = { ts: Date.now(), v: value };
    warm.set(scope, stamped);
    AsyncStorage.setItem(prefix + scope, JSON.stringify(stamped)).catch(() => {});
  };

  return { preload, get, getStamped, set };
}
