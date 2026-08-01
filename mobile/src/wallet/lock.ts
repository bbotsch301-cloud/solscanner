/**
 * Optional app-level PIN that adds a SECOND layer of encryption over each seed, on
 * top of the OS keychain. Threat it addresses: an attacker who can read the keychain
 * (unlocked/rooted/jailbroken device, or a storage dump) still gets only ciphertext —
 * decrypting needs the PIN, which is never stored anywhere (only in the user's head).
 *
 * Design — wrapped data key (DEK):
 *   • A random 32-byte DEK encrypts every seed secret (XChaCha20-Poly1305 AEAD).
 *   • The DEK is itself encrypted ("wrapped") by a key derived from the PIN via scrypt
 *     (memory-hard, salted). Only the wrapped DEK + salt live on the device.
 *   • Unlock = scrypt(PIN,salt) → unwrap DEK (AEAD tag fails on a wrong PIN) → hold the
 *     DEK in memory for the session. Change PIN = re-wrap the same DEK (seeds untouched).
 *
 * The DEK exists in memory only while unlocked and is cleared on lock/background.
 */
import { scrypt } from "@noble/hashes/scrypt";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import * as SecureStore from "expo-secure-store";

const LOCK_META = "solwallet.lock.v1";
const ATTEMPTS_KEY = "solwallet.lock.attempts.v1";
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// scrypt cost: memory-hard, strong against PIN brute force, ~0.5–0.8s on-device.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 } as const;

// Brute-force throttle: the first few misses are free (fat-finger tolerance), then a
// rising lockout defeats offline/on-device guessing of a short PIN even if the attacker
// can restart the app (the counter is persisted, not just in memory).
const FREE_ATTEMPTS = 5;
const BACKOFF_MS = [30_000, 60_000, 300_000, 900_000, 3_600_000]; // 30s→1m→5m→15m→1h
function backoffFor(fails: number): number {
  if (fails <= FREE_ATTEMPTS) return 0;
  return BACKOFF_MS[Math.min(fails - FREE_ATTEMPTS - 1, BACKOFF_MS.length - 1)];
}

interface LockMeta {
  v: 1;
  salt: string;
  N: number;
  r: number;
  p: number;
  wrapNonce: string;
  wrappedDek: string;
}

// In-memory data key — present ONLY while unlocked. Never persisted in the clear.
let dek: Uint8Array | null = null;
// Cached "is a PIN configured?" so hot paths don't hit SecureStore on every read.
let enabledCache = false;
// Failed-attempt state, mirrored from SecureStore so a lockout survives an app restart.
let attempts: { fails: number; until: number } = { fails: 0, until: 0 };

async function loadAttempts(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(ATTEMPTS_KEY);
    attempts = raw ? (JSON.parse(raw) as { fails: number; until: number }) : { fails: 0, until: 0 };
  } catch {
    attempts = { fails: 0, until: 0 };
  }
}
async function saveAttempts(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ATTEMPTS_KEY, JSON.stringify(attempts), SECURE_OPTS);
  } catch {
    /* best-effort — the in-memory copy still throttles this session */
  }
}
async function resetAttempts(): Promise<void> {
  attempts = { fails: 0, until: 0 };
  try {
    await SecureStore.deleteItemAsync(ATTEMPTS_KEY);
  } catch {
    /* best-effort */
  }
}

/** Milliseconds remaining on a brute-force lockout (0 when the user may try now). */
export function lockoutRemainingMs(): number {
  return Math.max(0, attempts.until - Date.now());
}

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString("base64");
}
function unb64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64"));
}
function rand(n: number): Uint8Array {
  const a = new Uint8Array(n);
  (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(a);
  return a;
}
function kdf(pin: string, salt: Uint8Array, N: number, r: number, p: number): Uint8Array {
  return scrypt(new TextEncoder().encode(pin.normalize("NFKC")), salt, { N, r, p, dkLen: 32 });
}

/** Load whether a PIN is configured (call once at startup). */
export async function loadLockState(): Promise<boolean> {
  try {
    enabledCache = !!(await SecureStore.getItemAsync(LOCK_META));
  } catch {
    enabledCache = false;
  }
  await loadAttempts(); // restore any in-progress lockout from a previous run
  return enabledCache;
}

/** True if a PIN is configured. Synchronous (uses the cached value). */
export function pinEnabled(): boolean {
  return enabledCache;
}

/** True if the DEK is loaded (the app is unlocked for seed access). */
export function isUnlocked(): boolean {
  return dek !== null;
}

/** Clear the in-memory DEK (on background / auto-lock). */
export function lockNow(): void {
  dek = null;
}

/** Turn a random DEK into a fresh lock wrapped under `pin`. Holds the DEK. */
export async function createLock(pin: string): Promise<void> {
  const salt = rand(16);
  const kek = kdf(pin, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  const newDek = rand(32);
  const wrapNonce = rand(24);
  const wrappedDek = xchacha20poly1305(kek, wrapNonce).encrypt(newDek);
  const meta: LockMeta = {
    v: 1,
    salt: b64(salt),
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    wrapNonce: b64(wrapNonce),
    wrappedDek: b64(wrappedDek),
  };
  await SecureStore.setItemAsync(LOCK_META, JSON.stringify(meta), SECURE_OPTS);
  await resetAttempts();
  dek = newDek;
  enabledCache = true;
}

/**
 * Derive the KEK from the PIN and unwrap the DEK. False on a wrong PIN OR while a
 * brute-force lockout is active — callers show the remaining time via `lockoutRemainingMs`.
 * A correct PIN clears the counter; a wrong one advances the escalating lockout.
 */
export async function unlock(pin: string): Promise<boolean> {
  if (lockoutRemainingMs() > 0) return false; // throttled — don't even attempt
  const raw = await SecureStore.getItemAsync(LOCK_META);
  if (!raw) return false;
  const m = JSON.parse(raw) as LockMeta;
  const kek = kdf(pin, unb64(m.salt), m.N, m.r, m.p);
  try {
    dek = xchacha20poly1305(kek, unb64(m.wrapNonce)).decrypt(unb64(m.wrappedDek));
    if (attempts.fails || attempts.until) await resetAttempts(); // clean slate on success
    return true;
  } catch {
    dek = null; // wrong PIN — AEAD tag rejected
    attempts.fails += 1;
    const wait = backoffFor(attempts.fails);
    attempts.until = wait > 0 ? Date.now() + wait : 0;
    await saveAttempts();
    return false;
  }
}

/** Re-wrap the current DEK under a new PIN (verify the old one first). */
export async function rewrap(oldPin: string, newPin: string): Promise<boolean> {
  if (!(await unlock(oldPin))) return false;
  const current = dek!;
  const salt = rand(16);
  const kek = kdf(newPin, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p);
  const wrapNonce = rand(24);
  const wrappedDek = xchacha20poly1305(kek, wrapNonce).encrypt(current);
  const meta: LockMeta = {
    v: 1,
    salt: b64(salt),
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    wrapNonce: b64(wrapNonce),
    wrappedDek: b64(wrappedDek),
  };
  await SecureStore.setItemAsync(LOCK_META, JSON.stringify(meta), SECURE_OPTS);
  return true;
}

/** Remove the lock metadata (the vault decrypts its seeds to plaintext first). */
export async function destroyLock(): Promise<void> {
  await SecureStore.deleteItemAsync(LOCK_META);
  await resetAttempts();
  enabledCache = false;
  dek = null;
}

/** Encrypt a secret string with the in-memory DEK → a `{n,c}` JSON blob. */
export function encryptSecret(plaintext: string): string {
  if (!dek) throw new Error("Wallet is locked.");
  const nonce = rand(24);
  const ct = xchacha20poly1305(dek, nonce).encrypt(new TextEncoder().encode(plaintext));
  return JSON.stringify({ n: b64(nonce), c: b64(ct) });
}

/** Decrypt a `{n,c}` blob with the in-memory DEK. Throws if locked or tampered. */
export function decryptSecret(blob: string): string {
  if (!dek) throw new Error("Wallet is locked.");
  const { n, c } = JSON.parse(blob) as { n: string; c: string };
  const pt = xchacha20poly1305(dek, unb64(n)).decrypt(unb64(c));
  return new TextDecoder().decode(pt);
}
