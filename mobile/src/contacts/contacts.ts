/**
 * Address book — user-named saved recipients (distinct from the auto-recorded send history in
 * safety/recipients.ts). Persisted in AsyncStorage (addresses are non-secret, and the list can
 * grow past SecureStore's small value limit). Loaded once at startup so `findContact` is a
 * synchronous name lookup for display on the Send screen.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PublicKey } from "@solana/web3.js";
import { isEvmAddress } from "../wallet/evm";

export type ContactKind = "solana" | "evm";

export interface Contact {
  id: string;
  name: string;
  address: string;
  kind: ContactKind;
  note?: string;
}

const KEY = "solwallet.contacts.v1";
let contacts: Contact[] = [];
let loaded = false;

/** base58 (Solana) vs 0x (EVM), or null if the string isn't a valid address on either. */
export function detectKind(address: string): ContactKind | null {
  const a = address.trim();
  if (isEvmAddress(a)) return "evm";
  try {
    return new PublicKey(a) ? "solana" : null;
  } catch {
    return null;
  }
}

// EVM addresses compare case-insensitively; base58 is case-sensitive.
const normFor = (address: string, kind: ContactKind) =>
  kind === "evm" ? address.trim().toLowerCase() : address.trim();

function persist(): void {
  AsyncStorage.setItem(KEY, JSON.stringify(contacts)).catch(() => {});
}
function newId(): string {
  const b = new Uint8Array(8);
  (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(b);
  return "c" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Load the address book (call once at startup). Best-effort. */
export async function loadContacts(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    contacts = raw ? (JSON.parse(raw) as Contact[]) : [];
  } catch {
    contacts = [];
  }
  loaded = true;
}

/** All contacts, sorted by name; optionally filtered to one chain kind. */
export function listContacts(kind?: ContactKind): Contact[] {
  return contacts
    .filter((c) => !kind || c.kind === kind)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The saved contact for an address (case-insensitive for EVM), or undefined. */
export function findContact(address: string): Contact | undefined {
  const a = address.trim();
  const lower = a.toLowerCase();
  return contacts.find((c) => (c.kind === "evm" ? c.address.toLowerCase() === lower : c.address === a));
}

/** Add a contact. Throws on an invalid or duplicate address. Returns the created contact. */
export async function addContact(input: { name: string; address: string; note?: string }): Promise<Contact> {
  if (!loaded) await loadContacts();
  const kind = detectKind(input.address);
  if (!kind) throw new Error("That doesn't look like a valid Solana or EVM address.");
  const key = normFor(input.address, kind);
  if (contacts.some((c) => normFor(c.address, c.kind) === key)) {
    throw new Error("That address is already saved.");
  }
  const contact: Contact = {
    id: newId(),
    name: input.name.trim() || "Unnamed",
    address: input.address.trim(),
    kind,
    note: input.note?.trim() || undefined,
  };
  contacts = [...contacts, contact];
  persist();
  return contact;
}

/** Edit a contact's name/note (address is immutable — remove + re-add to change it). */
export async function updateContact(id: string, patch: { name?: string; note?: string }): Promise<void> {
  if (!loaded) await loadContacts();
  contacts = contacts.map((c) =>
    c.id === id
      ? { ...c, name: patch.name?.trim() || c.name, note: patch.note !== undefined ? patch.note.trim() || undefined : c.note }
      : c
  );
  persist();
}

export async function removeContact(id: string): Promise<void> {
  if (!loaded) await loadContacts();
  contacts = contacts.filter((c) => c.id !== id);
  persist();
}
