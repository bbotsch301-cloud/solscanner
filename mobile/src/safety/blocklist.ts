/**
 * Recipient blocklist — a remotely-updatable set of known scam/drainer addresses for
 * both ecosystems, wired into the Solana and EVM recipient risk checks so a flagged
 * address is a hard "danger" stop before any funds move.
 *
 * Why remote: a blocklist baked into the app binary goes stale the moment a new drainer
 * appears and can't be updated without shipping a release. Instead the list is fetched
 * from EXPO_PUBLIC_BLOCKLIST_URL at startup (JSON `{ solana: string[], evm: string[] }`),
 * cached in SecureStore so it still protects offline, and FAILS OPEN — if the fetch fails
 * and nothing is cached, no address is force-blocked (the other heuristics still apply),
 * so a bad endpoint can never brick sending. EVM addresses are matched case-insensitively.
 */
import * as SecureStore from "expo-secure-store";

const CACHE_KEY = "solwallet.blocklist.v1";
const SOURCE_URL = process.env.EXPO_PUBLIC_BLOCKLIST_URL;

let solana = new Set<string>();
let evm = new Set<string>();

function ingest(data: { solana?: unknown; evm?: unknown }): void {
  if (Array.isArray(data.solana))
    solana = new Set(data.solana.filter((a): a is string => typeof a === "string"));
  if (Array.isArray(data.evm))
    evm = new Set(
      data.evm.filter((a): a is string => typeof a === "string").map((a) => a.toLowerCase())
    );
}

/** Load the blocklist (cache first, then refresh from the remote source). Best-effort. */
export async function loadBlocklist(): Promise<void> {
  // Seed from the on-device cache first so protection survives being offline.
  try {
    const cached = await SecureStore.getItemAsync(CACHE_KEY);
    if (cached) ingest(JSON.parse(cached) as { solana?: unknown; evm?: unknown });
  } catch {
    /* ignore a corrupt cache */
  }
  if (!SOURCE_URL) return; // no endpoint configured — cache-only
  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) return;
    const data = (await res.json()) as { solana?: unknown; evm?: unknown };
    ingest(data);
    try {
      await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify({ solana: [...solana], evm: [...evm] }));
    } catch {
      /* cache write is best-effort */
    }
  } catch {
    /* offline / bad endpoint — keep whatever the cache gave us */
  }
}

/** True if a Solana address is on the scam/drainer blocklist. */
export function isBlockedSolana(address: string): boolean {
  return solana.has(address);
}

/** True if an EVM address is on the scam/drainer blocklist (case-insensitive). */
export function isBlockedEvm(address: string): boolean {
  return evm.has(address.toLowerCase());
}
