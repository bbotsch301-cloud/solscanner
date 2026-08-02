/**
 * Persisted PUBLIC addresses per (seedId, account index). These are not secret — they're the same
 * strings shown in the UI, QR codes, and on-chain — so they live in plain AsyncStorage. Caching
 * them lets us show a switched wallet's assets INSTANTLY (fetch balances straight from the stored
 * address) without first running the expensive BIP39 key derivation. The private key is derived
 * separately, lazily, only when it's actually needed to sign — so nothing secret is persisted here.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface PubAddress {
  sol: string;
  evm: string | null;
}

const KEY = "solwallet.pubaddrs.v1";
const mapKey = (seedId: string, index: number) => `${seedId}:${index}`;

let store: Record<string, PubAddress> = {};
let loaded = false;

function persist(): void {
  AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
}

/** Load the address cache into memory (call once at startup, best-effort). */
export async function loadPubAddresses(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    store = raw ? (JSON.parse(raw) as Record<string, PubAddress>) : {};
  } catch {
    store = {};
  }
  loaded = true;
}

/** The stored public addresses for one account, or undefined if not derived/seen yet. */
export function getPubAddress(seedId: string, index: number): PubAddress | undefined {
  return store[mapKey(seedId, index)];
}

/**
 * Compares every field rather than naming them.
 *
 * This used to read `cur.sol === addrs.sol && cur.evm === addrs.evm`. Add a third chain's address
 * to `PubAddress` and that check keeps compiling while silently ignoring the new field — so the
 * first derivation of that address would be judged "unchanged" and never persisted, and the
 * account would re-derive it on every launch. A hardcoded field list in an equality check is the
 * same failure shape as a hardcoded branch in a dispatch: fine until the type grows.
 */
function sameAddresses(a: PubAddress, b: PubAddress): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof PubAddress>;
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

/** Remember an account's public addresses (write-through; no-op if unchanged). */
export function putPubAddress(seedId: string, index: number, addrs: PubAddress): void {
  const k = mapKey(seedId, index);
  const cur = store[k];
  if (cur && sameAddresses(cur, addrs)) return;
  store = { ...store, [k]: addrs };
  if (loaded) persist();
}

/** Forget every account's addresses for a removed wallet. */
export function dropPubAddresses(seedId: string): void {
  const prefix = `${seedId}:`;
  let changed = false;
  const next: Record<string, PubAddress> = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith(prefix)) changed = true;
    else next[k] = v;
  }
  if (changed) {
    store = next;
    persist();
  }
}
