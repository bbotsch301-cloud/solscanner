/**
 * Recipient history — the basis for address-poisoning defense. A poisoning attack seeds a
 * victim's transaction history with a "lookalike" address (same first and last few
 * characters as one they really use) hoping they copy the wrong one. We keep our OWN list
 * of addresses the user has actually sent to and flag a new recipient that imitates a past
 * one (matching ends, different middle) — the poisoning signature — plus mark genuine
 * first-time recipients. Works for both base58 (Solana) and 0x (EVM) addresses.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "solwallet.recipients.v1";
const MAX = 200; // cap the stored history
const PREFIX = 4;
const SUFFIX = 4;

let history: string[] = [];
let loaded = false;

const norm = (a: string) => a.trim();

function ends(a: string): { p: string; s: string } {
  const body = a.replace(/^0x/i, "");
  return { p: body.slice(0, PREFIX).toLowerCase(), s: body.slice(-SUFFIX).toLowerCase() };
}

/** Load the sent-to history (call once at startup). Best-effort. */
export async function loadRecipients(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    history = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    history = [];
  }
  loaded = true;
}

/** Record a successful send's recipient (most-recent first, de-duplicated, capped). */
export async function recordRecipient(address: string): Promise<void> {
  if (!loaded) await loadRecipients();
  const a = norm(address);
  history = [a, ...history.filter((x) => x !== a)].slice(0, MAX);
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(history));
  } catch {
    /* best-effort */
  }
}

/**
 * A previously-used address that this one imitates (same first & last chars, different
 * middle) — the address-poisoning signature — or null if none. An exact repeat returns
 * null (it's a real prior recipient, not a lookalike).
 */
export function findLookalike(address: string): string | null {
  const a = norm(address);
  if (history.includes(a)) return null;
  const { p, s } = ends(a);
  for (const past of history) {
    const e = ends(past);
    if (e.p === p && e.s === s) return past;
  }
  return null;
}
