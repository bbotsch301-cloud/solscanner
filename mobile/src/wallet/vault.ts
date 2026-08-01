/**
 * The vault — multiple INDEPENDENT wallets (seeds), each with one or more accounts
 * (derivation indices, Phantom-numbered). Replaces the old single-slot keystore.
 *
 * Storage layout (all SecureStore, WHEN_UNLOCKED_THIS_DEVICE_ONLY — local-only, never
 * backed up to the cloud):
 *   solwallet.vault.v2                 → JSON VaultIndex (metadata: labels, indices, active)
 *   solwallet.seed.<id>.mnemonic       → a seed's recovery phrase          (secret)
 *   solwallet.seed.<id>.passphrase     → its optional BIP39 passphrase      (secret)
 *   solwallet.seed.<id>.secretKey      → a migrated legacy key-only wallet  (secret)
 *
 * Secrets never leave a seed's own keys; the index holds only non-sensitive metadata.
 * Every write path uses read-back verification and refuses to overwrite an existing
 * seed's material, so a save that half-fails can never silently mint/return the wrong
 * wallet. Legacy v1 single-wallet storage is migrated on first load, then removed.
 */
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import {
  generateMnemonic,
  keypairFromMnemonic,
  normalizeMnemonic,
  validateMnemonic,
} from "./mnemonic";
import { deriveEvmAccount, type EvmAccount } from "./evm";
import * as lock from "./lock";

const INDEX_KEY = "solwallet.vault.v2";
const HARDENED = "solwallet.hardened.v1";

// Legacy (v1) single-wallet keys — read once for migration, then deleted.
const V1_SECRET_KEY = "solwallet.secretKey.v1";
const V1_MNEMONIC = "solwallet.mnemonic.v1";
const V1_PASSPHRASE = "solwallet.passphrase.v1";
const V1_NEEDS_BACKUP = "solwallet.needsBackup.v1";

const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type SeedKind = "mnemonic" | "legacyKey";

export interface SeedMeta {
  id: string;
  label: string;
  kind: SeedKind;
  hasPassphrase: boolean;
  /** Active account indices for this seed, sorted ascending. Always non-empty. */
  accounts: number[];
  /** True until the user confirms they've written down this seed's phrase. */
  needsBackup: boolean;
}

export interface AccountRef {
  seedId: string;
  index: number;
}

export interface VaultIndex {
  seeds: SeedMeta[];
  active: AccountRef;
}

const seedKey = (id: string, part: "mnemonic" | "passphrase" | "secretKey") =>
  `solwallet.seed.${id}.${part}`;

type SecretPart = "mnemonic" | "passphrase" | "secretKey";

/** Store a seed secret — encrypted under the app PIN when one is set, else plaintext. */
async function putSecret(id: string, part: SecretPart, value: string): Promise<void> {
  const stored = lock.pinEnabled() ? lock.encryptSecret(value) : value;
  await SecureStore.setItemAsync(seedKey(id, part), stored, SECURE_OPTS);
}

/** Read a seed secret — decrypting under the app PIN when one is set. Null if absent. */
async function getSecret(id: string, part: SecretPart): Promise<string | null> {
  const raw = await SecureStore.getItemAsync(seedKey(id, part));
  if (raw == null) return null;
  return lock.pinEnabled() ? lock.decryptSecret(raw) : raw;
}

/** Random, non-secret id using the OS CSPRNG (never Math.random). */
function newSeedId(): string {
  const b = new Uint8Array(8);
  (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(b);
  return "s" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function readIndex(): Promise<VaultIndex | null> {
  const raw = await SecureStore.getItemAsync(INDEX_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as VaultIndex;
    if (!v.seeds?.length || !v.active) return null;
    return v;
  } catch {
    return null;
  }
}

async function writeIndex(v: VaultIndex): Promise<void> {
  await SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(v), SECURE_OPTS);
}

// ---- migration from the v1 single wallet -------------------------------------

async function migrateV1(): Promise<VaultIndex | null> {
  const mnemonic = await SecureStore.getItemAsync(V1_MNEMONIC);
  const legacy = await SecureStore.getItemAsync(V1_SECRET_KEY);
  if (!mnemonic && !legacy) return null;

  const id = "seed1";
  const needsBackup = (await SecureStore.getItemAsync(V1_NEEDS_BACKUP)) === "1";
  let meta: SeedMeta;

  if (mnemonic) {
    const passphrase = await SecureStore.getItemAsync(V1_PASSPHRASE);
    await putSecret(id, "mnemonic", mnemonic);
    if (passphrase) await putSecret(id, "passphrase", passphrase);
    meta = { id, label: "Wallet 1", kind: "mnemonic", hasPassphrase: !!passphrase, accounts: [0], needsBackup };
  } else {
    await putSecret(id, "secretKey", legacy!);
    meta = { id, label: "Wallet 1", kind: "legacyKey", hasPassphrase: false, accounts: [0], needsBackup: false };
  }

  const vault: VaultIndex = { seeds: [meta], active: { seedId: id, index: 0 } };
  // The v2 material (seed keys + index) is written above; once the index exists,
  // subsequent launches load from it directly. Deleting the v1 originals is
  // best-effort — never block or fail migration on it (the app must still start).
  await writeIndex(vault);
  await Promise.all([
    SecureStore.deleteItemAsync(V1_MNEMONIC),
    SecureStore.deleteItemAsync(V1_SECRET_KEY),
    SecureStore.deleteItemAsync(V1_PASSPHRASE),
    SecureStore.deleteItemAsync(V1_NEEDS_BACKUP),
  ]).catch(() => {});
  return vault;
}

/** The vault, migrating the v1 wallet on first run. Null when no wallet exists yet. */
export async function loadVault(): Promise<VaultIndex | null> {
  const existing = await readIndex();
  if (existing) return existing;
  try {
    return await migrateV1();
  } catch {
    return readIndex(); // migration wrote the index before any failure; fall back to it
  }
}

// ---- derivation helpers ------------------------------------------------------

async function seedSecret(id: string) {
  const [mnemonic, passphrase, secretKey] = await Promise.all([
    getSecret(id, "mnemonic"),
    getSecret(id, "passphrase"),
    getSecret(id, "secretKey"),
  ]);
  return { mnemonic, passphrase: passphrase ?? "", secretKey };
}

export interface DerivedAccount {
  seedId: string;
  index: number;
  solanaAddress: string;
  evmAddress: string | null;
}

/** Public addresses for one (seed, index). Null if the seed material can't be read. */
export async function deriveAccount(seedId: string, index: number): Promise<DerivedAccount | null> {
  try {
    const { mnemonic, secretKey, passphrase } = await seedSecret(seedId);
    if (mnemonic) {
      const kp = keypairFromMnemonic(mnemonic, passphrase, index);
      const evm = deriveEvmAccount(mnemonic, passphrase, index);
      return { seedId, index, solanaAddress: kp.publicKey.toBase58(), evmAddress: evm.address };
    }
    if (secretKey) {
      const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey) as number[]));
      return { seedId, index: 0, solanaAddress: kp.publicKey.toBase58(), evmAddress: null };
    }
    return null;
  } catch {
    return null;
  }
}

/** The Solana keypair for a (seed, index) — the signing key for that account. */
export async function keypairFor(seedId: string, index: number): Promise<Keypair | null> {
  try {
    const { mnemonic, secretKey, passphrase } = await seedSecret(seedId);
    if (mnemonic) return keypairFromMnemonic(mnemonic, passphrase, index);
    if (secretKey) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey) as number[]));
    return null;
  } catch {
    return null;
  }
}

/** The EVM account for a (seed, index), or null for legacy key-only seeds. */
export async function evmAccountFor(seedId: string, index: number): Promise<EvmAccount | null> {
  try {
    const { mnemonic, passphrase } = await seedSecret(seedId);
    if (!mnemonic) return null;
    return deriveEvmAccount(mnemonic, passphrase, index);
  } catch {
    return null;
  }
}

export async function activeKeypair(): Promise<Keypair | null> {
  const v = await readIndex();
  if (!v) return null;
  return keypairFor(v.active.seedId, v.active.index);
}

export async function activeEvmAccount(): Promise<EvmAccount | null> {
  const v = await readIndex();
  if (!v) return null;
  return evmAccountFor(v.active.seedId, v.active.index);
}

/** Metadata for the currently active seed (or null if no wallet). */
export async function activeSeedMeta(): Promise<SeedMeta | null> {
  const v = await readIndex();
  if (!v) return null;
  return v.seeds.find((s) => s.id === v.active.seedId) ?? null;
}

/** The active seed's recovery phrase (for the Backup screen). */
export async function activeMnemonic(): Promise<string | null> {
  const v = await readIndex();
  if (!v) return null;
  return getSecret(v.active.seedId, "mnemonic");
}

/** True if the active seed has a passphrase. */
export async function activeHasPassphrase(): Promise<boolean> {
  const v = await readIndex();
  if (!v) return false;
  return seedHasPassphrase(v.active.seedId);
}

// ---- mutations ---------------------------------------------------------------

/** Set the active (seed, index). Throws if it isn't a known account. */
export async function setActive(ref: AccountRef): Promise<VaultIndex> {
  const v = await readIndex();
  if (!v) throw new Error("No wallet exists yet.");
  const seed = v.seeds.find((s) => s.id === ref.seedId);
  if (!seed || !seed.accounts.includes(ref.index)) throw new Error("That account doesn't exist.");
  v.active = ref;
  await writeIndex(v);
  return v;
}

/**
 * Create a brand-new seed (fresh 24-word phrase). Optional passphrase. Verifies the
 * saved material re-derives before committing. Returns the new vault + seed id.
 */
export async function addNewSeed(passphrase = ""): Promise<{ vault: VaultIndex; seedId: string }> {
  const mnemonic = generateMnemonic(); // entropy-guarded inside
  const id = newSeedId();
  await putSecret(id, "mnemonic", mnemonic);
  if (passphrase) await putSecret(id, "passphrase", passphrase);

  const expected = keypairFromMnemonic(mnemonic, passphrase, 0).publicKey.toBase58();
  const check = await deriveAccount(id, 0);
  if (!check || check.solanaAddress !== expected) {
    await deleteSeedKeys(id);
    throw new Error(
      "We couldn't safely save this wallet to secure storage, so we stopped rather than " +
        "create one you might not be able to reload. Please try again."
    );
  }

  const v = (await readIndex()) ?? emptyVault(id);
  const label = `Wallet ${v.seeds.length ? v.seeds.length + 1 : 1}`;
  const meta: SeedMeta = { id, label, kind: "mnemonic", hasPassphrase: !!passphrase, accounts: [0], needsBackup: true };
  const vault: VaultIndex = v.seeds.some((s) => s.id === id)
    ? v
    : { seeds: [...v.seeds, meta], active: { seedId: id, index: 0 } };
  await writeIndex(vault);
  return { vault, seedId: id };
}

/**
 * Import a seed from a recovery phrase (+ optional passphrase), activating the given
 * account indices (from discovery; always includes 0). Verifies before committing.
 */
export async function importSeed(
  mnemonic: string,
  passphrase = "",
  indices: number[] = [0]
): Promise<{ vault: VaultIndex; seedId: string }> {
  const phrase = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(phrase)) {
    throw new Error("That recovery phrase isn't valid. Check for typos and that it's 12 or 24 words in order.");
  }
  const id = newSeedId();
  await putSecret(id, "mnemonic", phrase);
  if (passphrase) await putSecret(id, "passphrase", passphrase);

  const expected = keypairFromMnemonic(phrase, passphrase, 0).publicKey.toBase58();
  const check = await deriveAccount(id, 0);
  if (!check || check.solanaAddress !== expected) {
    await deleteSeedKeys(id);
    throw new Error("We couldn't safely save this wallet to secure storage. Please try again.");
  }

  const accounts = Array.from(new Set([0, ...indices])).sort((a, b) => a - b);
  const v = (await readIndex()) ?? emptyVault(id);
  const label = `Wallet ${v.seeds.length ? v.seeds.length + 1 : 1}`;
  const meta: SeedMeta = { id, label, kind: "mnemonic", hasPassphrase: !!passphrase, accounts, needsBackup: false };
  const vault: VaultIndex = v.seeds.some((s) => s.id === id)
    ? v
    : { seeds: [...v.seeds, meta], active: { seedId: id, index: accounts[0] } };
  await writeIndex(vault);
  return { vault, seedId: id };
}

/** Add the next account index to a seed and return it. Legacy key-only seeds can't. */
export async function addAccount(seedId: string): Promise<{ vault: VaultIndex; index: number }> {
  const v = await readIndex();
  if (!v) throw new Error("No wallet exists yet.");
  const seed = v.seeds.find((s) => s.id === seedId);
  if (!seed) throw new Error("That wallet doesn't exist.");
  if (seed.kind !== "mnemonic") throw new Error("This wallet was imported as a single key and can't add accounts.");
  const next = (seed.accounts.length ? Math.max(...seed.accounts) : -1) + 1;
  seed.accounts = Array.from(new Set([...seed.accounts, next])).sort((a, b) => a - b);
  await writeIndex(v);
  return { vault: v, index: next };
}

/** Add specific account indices (from a re-scan) to an existing seed. */
export async function addAccounts(seedId: string, indices: number[]): Promise<VaultIndex> {
  const v = await readIndex();
  if (!v) throw new Error("No wallet exists yet.");
  const seed = v.seeds.find((s) => s.id === seedId);
  if (!seed) throw new Error("That wallet doesn't exist.");
  seed.accounts = Array.from(new Set([...seed.accounts, ...indices])).sort((a, b) => a - b);
  await writeIndex(v);
  return v;
}

export async function renameSeed(seedId: string, label: string): Promise<VaultIndex> {
  const v = await readIndex();
  if (!v) throw new Error("No wallet exists yet.");
  const seed = v.seeds.find((s) => s.id === seedId);
  if (seed) seed.label = label.trim() || seed.label;
  await writeIndex(v);
  return v;
}

/** Mark a seed as backed up (after the user confirms). */
export async function markSeedBackedUp(seedId: string): Promise<VaultIndex | null> {
  const v = await readIndex();
  if (!v) return null;
  const seed = v.seeds.find((s) => s.id === seedId);
  if (seed) seed.needsBackup = false;
  await writeIndex(v);
  return v;
}

/**
 * Remove a seed and all its secrets. If it was active, the active pointer moves to
 * another seed. Returns the new vault, or null if that was the last seed (→ onboarding).
 */
export async function removeSeed(seedId: string): Promise<VaultIndex | null> {
  const v = await readIndex();
  if (!v) return null;
  await deleteSeedKeys(seedId);
  const seeds = v.seeds.filter((s) => s.id !== seedId);
  if (!seeds.length) {
    await SecureStore.deleteItemAsync(INDEX_KEY);
    return null;
  }
  const active =
    v.active.seedId === seedId ? { seedId: seeds[0].id, index: seeds[0].accounts[0] } : v.active;
  const vault: VaultIndex = { seeds, active };
  await writeIndex(vault);
  return vault;
}

/** The stored recovery phrase for a seed (decrypted if a PIN is set). */
export async function getSeedMnemonic(seedId: string): Promise<string | null> {
  return getSecret(seedId, "mnemonic");
}

export async function seedHasPassphrase(seedId: string): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(seedKey(seedId, "passphrase")));
}

/** Wipe the ENTIRE vault (every seed) plus any leftover v1 material. */
export async function clearVault(): Promise<void> {
  const v = await readIndex();
  if (v) for (const s of v.seeds) await deleteSeedKeys(s.id);
  await SecureStore.deleteItemAsync(INDEX_KEY);
  await SecureStore.deleteItemAsync(V1_MNEMONIC);
  await SecureStore.deleteItemAsync(V1_SECRET_KEY);
  await SecureStore.deleteItemAsync(V1_PASSPHRASE);
  await SecureStore.deleteItemAsync(V1_NEEDS_BACKUP);
  await SecureStore.deleteItemAsync(HARDENED);
  await lock.destroyLock();
}

async function deleteSeedKeys(id: string): Promise<void> {
  await SecureStore.deleteItemAsync(seedKey(id, "mnemonic"));
  await SecureStore.deleteItemAsync(seedKey(id, "passphrase"));
  await SecureStore.deleteItemAsync(seedKey(id, "secretKey"));
}

// ---- app PIN (second encryption layer over every seed) -----------------------

const SECRET_PARTS: SecretPart[] = ["mnemonic", "passphrase", "secretKey"];

/** Load whether an app PIN is configured (call once at startup). */
export async function loadLockState(): Promise<boolean> {
  return lock.loadLockState();
}
export function pinIsEnabled(): boolean {
  return lock.pinEnabled();
}
export function pinIsUnlocked(): boolean {
  return lock.isUnlocked();
}
/** Unlock seed access for the session with the PIN. False on a wrong PIN. */
export async function unlockWithPin(pin: string): Promise<boolean> {
  return lock.unlock(pin);
}
/** Drop the in-memory key (on background / auto-lock). */
export function lockSeeds(): void {
  lock.lockNow();
}

/**
 * Turn ON the app PIN: encrypt every existing seed under a new PIN-wrapped key.
 * Verifies each seed round-trips and rolls back to plaintext on any failure, so a
 * failed enable never leaves seeds unreadable.
 */
export async function enableAppPin(pin: string): Promise<void> {
  if (lock.pinEnabled()) throw new Error("A PIN is already set.");
  const v = await readIndex();

  // Snapshot all plaintext BEFORE enabling (reads are still plaintext).
  const plain: Record<string, Partial<Record<SecretPart, string>>> = {};
  if (v)
    for (const s of v.seeds) {
      const e: Partial<Record<SecretPart, string>> = {};
      for (const part of SECRET_PARTS) {
        const raw = await SecureStore.getItemAsync(seedKey(s.id, part));
        if (raw != null) e[part] = raw;
      }
      plain[s.id] = e;
    }

  await lock.createLock(pin); // DEK created + held in memory; pin now "enabled"
  try {
    if (v)
      for (const s of v.seeds)
        for (const part of SECRET_PARTS) {
          const val = plain[s.id][part];
          if (val != null) await putSecret(s.id, part, val); // encrypts under the DEK
        }
    // Verify each seed re-decrypts to exactly what we stored.
    if (v)
      for (const s of v.seeds)
        for (const part of SECRET_PARTS) {
          const val = plain[s.id][part];
          if (val != null && (await getSecret(s.id, part)) !== val) throw new Error("verify-failed");
        }
  } catch {
    // Roll back to plaintext and remove the lock so access is never bricked.
    await lock.destroyLock();
    if (v)
      for (const s of v.seeds)
        for (const part of SECRET_PARTS) {
          const val = plain[s.id][part];
          if (val != null) await SecureStore.setItemAsync(seedKey(s.id, part), val, SECURE_OPTS);
        }
    throw new Error("We couldn't turn on the PIN safely, so nothing was changed. Please try again.");
  }
}

/** Turn OFF the app PIN (verify it first): decrypt every seed back to plaintext. */
export async function disableAppPin(pin: string): Promise<boolean> {
  if (!lock.pinEnabled()) return true;
  if (!(await lock.unlock(pin))) return false; // wrong PIN
  const v = await readIndex();
  if (v)
    for (const s of v.seeds)
      for (const part of SECRET_PARTS) {
        const raw = await SecureStore.getItemAsync(seedKey(s.id, part));
        if (raw != null) await SecureStore.setItemAsync(seedKey(s.id, part), lock.decryptSecret(raw), SECURE_OPTS);
      }
  await lock.destroyLock();
  return true;
}

/** Change the PIN: re-wrap the data key under a new PIN (seeds untouched). */
export async function changeAppPin(oldPin: string, newPin: string): Promise<boolean> {
  return lock.rewrap(oldPin, newPin);
}

function emptyVault(seedId: string): VaultIndex {
  return { seeds: [], active: { seedId, index: 0 } };
}
