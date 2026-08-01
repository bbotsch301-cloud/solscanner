/**
 * Squads Protocol v4 multisig treasury config.
 *
 * The app can save MANY multisigs (created in-app or connected by address) and keeps one
 * "active" — the target for proposals / vault reads. Persisted as a list + active pointer in
 * SecureStore; migrates the old single-address key. EXPO_PUBLIC_MULTISIG seeds a default entry.
 * We only ever wrap Squads' official audited program.
 */
import * as SecureStore from "expo-secure-store";
import { PublicKey } from "@solana/web3.js";
import * as multisig from "@sqds/multisig";

const STORE_KEY = "solwallet.multisig.v2"; // { list: MultisigEntry[], active: string }
const LEGACY_KEY = "solwallet.multisig.v1"; // single address (migrated on first load)

export interface MultisigEntry {
  address: string;
  /** Optional user-given name (defaults to the short address in the UI). */
  label?: string;
}

let list: MultisigEntry[] = [];
let active = "";

/** Squads v4 on-chain program — verify against squads.so/github before mainnet use. */
export const SQUADS_PROGRAM_ID = multisig.PROGRAM_ID;

async function persist(): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify({ list, active }));
  } catch {
    /* best-effort */
  }
}

/** Load saved multisigs + active pointer (call once at startup, before rendering). */
export async function loadMultisigPref(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { list?: MultisigEntry[]; active?: string };
      list = Array.isArray(parsed.list) ? parsed.list.filter((e) => e && e.address) : [];
      active = typeof parsed.active === "string" ? parsed.active : "";
    } else {
      // Migrate the old single-address storage into the list.
      const legacy = await SecureStore.getItemAsync(LEGACY_KEY);
      if (legacy) {
        list = [{ address: legacy }];
        active = legacy;
        await persist();
      }
    }
  } catch {
    /* keep defaults */
  }
  // Seed the env default if present.
  const env = process.env.EXPO_PUBLIC_MULTISIG?.trim();
  if (env) {
    if (!list.some((e) => e.address === env)) list = [...list, { address: env }];
    if (!active) active = env;
  }
  // The active pointer must reference an existing entry.
  if (active && !list.some((e) => e.address === active)) active = "";
  if (!active && list.length) active = list[0].address;
}

/** All saved multisigs (never mutate the returned array). */
export function savedMultisigs(): MultisigEntry[] {
  return list;
}

export function activeMultisigAddress(): string {
  return active;
}

/** Display label for a saved multisig (its name, or a short address). */
export function multisigLabel(address: string): string {
  const e = list.find((x) => x.address === address);
  return e?.label?.trim() || `${address.slice(0, 4)}…${address.slice(-4)}`;
}

/** Add (or update) a multisig and make it active. */
export async function addMultisig(address: string, label?: string): Promise<void> {
  const a = address.trim();
  if (!a) return;
  const existing = list.find((e) => e.address === a);
  if (!existing) list = [...list, { address: a, label }];
  else if (label) list = list.map((e) => (e.address === a ? { ...e, label } : e));
  active = a;
  await persist();
}

/** Switch which saved multisig is active. */
export async function setActiveMultisig(address: string): Promise<void> {
  if (list.some((e) => e.address === address)) {
    active = address;
    await persist();
  }
}

/** Remove a saved multisig (only forgets it on this device; the on-chain Squad is untouched). */
export async function removeMultisig(address: string): Promise<void> {
  list = list.filter((e) => e.address !== address);
  if (active === address) active = list[0]?.address ?? "";
  await persist();
}

/** Rename a saved multisig (empty clears the custom name). */
export async function renameMultisig(address: string, label: string): Promise<void> {
  list = list.map((e) => (e.address === address ? { ...e, label: label.trim() || undefined } : e));
  await persist();
}

export function multisigConfigured(): boolean {
  return active.trim().length > 0;
}

export function multisigPubkey(): PublicKey | null {
  try {
    return active ? new PublicKey(active) : null;
  } catch {
    return null;
  }
}

/** The default vault (index 0) of the active multisig that holds the treasury funds. */
export function vaultPda(): PublicKey | null {
  const ms = multisigPubkey();
  if (!ms) return null;
  const [pda] = multisig.getVaultPda({ multisigPda: ms, index: 0 });
  return pda;
}
