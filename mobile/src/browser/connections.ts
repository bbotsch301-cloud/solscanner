/**
 * Persisted per-origin dApp connections for the browser — which sites the user has approved, and for
 * which chain kind. Lets an approved site reconnect silently on a return visit, and gives the user a
 * "Connected sites" list to revoke. Non-secret (just origins), AsyncStorage-backed, load-once +
 * in-memory, mirroring dapps.ts/contacts.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ConnKind = "evm" | "solana";

export interface Connection {
  origin: string;
  evm?: boolean;
  solana?: boolean;
  at: number;
}

const KEY = "solwallet.browser.connections.v1";
let store: Record<string, Connection> = {};
let loaded = false;

function persist(): void {
  if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
}

export async function loadConnections(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    store = raw ? (JSON.parse(raw) as Record<string, Connection>) : {};
  } catch {
    store = {};
  }
  loaded = true;
}

/** True if `origin` is connected for the given chain kind. */
export function isConnected(origin: string, kind: ConnKind): boolean {
  return !!store[origin]?.[kind];
}

/** Record an approved connection for an origin + chain kind. */
export function setConnected(origin: string, kind: ConnKind, now: number): void {
  if (!origin || origin === "null") return;
  const cur = store[origin] ?? { origin, at: now };
  store = { ...store, [origin]: { ...cur, [kind]: true, at: now } };
  persist();
}

/** Forget an origin entirely (disconnect all chains). */
export function disconnectOrigin(origin: string): void {
  if (!store[origin]) return;
  const next = { ...store };
  delete next[origin];
  store = next;
  persist();
}

export function listConnections(): Connection[] {
  return Object.values(store).sort((a, b) => b.at - a.at);
}

export async function disconnectAll(): Promise<void> {
  store = {};
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    /* best-effort */
  }
}
