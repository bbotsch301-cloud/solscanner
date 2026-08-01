/**
 * Keypair persistence. New wallets are derived from a BIP39 mnemonic; both the
 * mnemonic and the derived secret key live in the device keychain via
 * expo-secure-store. Legacy wallets (created before recovery phrases) are still
 * loaded from their stored secret key.
 *
 * Secrets are written with WHEN_UNLOCKED_THIS_DEVICE_ONLY: encrypted by the OS
 * (iOS Keychain / Android Keystore), readable only while the device is unlocked, and
 * — critically — NEVER included in iCloud/iTunes backups and never synced to the
 * cloud. It's local to this one device, or nowhere.
 */
import * as SecureStore from "expo-secure-store";
import { Keypair } from "@solana/web3.js";
import { generateMnemonic, keypairFromMnemonic, normalizeMnemonic, validateMnemonic } from "./mnemonic";
import { deriveEvmAccount, type EvmAccount } from "./evm";

const SECRET_KEY = "solwallet.secretKey.v1";
const MNEMONIC = "solwallet.mnemonic.v1";
// The optional BIP39 passphrase (the "25th word"). Stored in the same secure,
// local-only, backup-excluded slot as the mnemonic because the keypair is
// re-derived from the seed on every unlock. Absent for wallets without one.
const PASSPHRASE = "solwallet.passphrase.v1";
const NEEDS_BACKUP = "solwallet.needsBackup.v1";
const HARDENED = "solwallet.hardened.v1";

/** Local-only, unlock-gated, excluded from device backups. */
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** True when a freshly-created wallet hasn't been backed up yet. */
export async function getNeedsBackup(): Promise<boolean> {
  return (await SecureStore.getItemAsync(NEEDS_BACKUP)) === "1";
}

export async function setNeedsBackup(v: boolean): Promise<void> {
  if (v) await SecureStore.setItemAsync(NEEDS_BACKUP, "1");
  else await SecureStore.deleteItemAsync(NEEDS_BACKUP);
}

async function persist(mnemonic: string | null, passphrase: string, kp: Keypair): Promise<void> {
  // Order matters. Write the passphrase FIRST so a partial failure can never leave a
  // mnemonic stored without its passphrase — that would silently re-derive a DIFFERENT
  // wallet on the next unlock. (Store only when set; delete any stale one so importing
  // a no-passphrase wallet over an old one doesn't inherit the old 25th word.)
  if (passphrase) await SecureStore.setItemAsync(PASSPHRASE, passphrase, SECURE_OPTS);
  else await SecureStore.deleteItemAsync(PASSPHRASE);
  if (mnemonic) await SecureStore.setItemAsync(MNEMONIC, mnemonic, SECURE_OPTS);
  await SecureStore.setItemAsync(SECRET_KEY, JSON.stringify(Array.from(kp.secretKey)), SECURE_OPTS);
  await SecureStore.setItemAsync(HARDENED, "1", SECURE_OPTS);

  // Read-back verification: prove the persisted secrets re-derive to the EXACT address
  // we just created, before the user could fund an address they can't reload. If a
  // write was dropped (keychain hiccup, storage pressure, backgrounded mid-write), wipe
  // the half-written state rather than leave a wallet that silently loads as someone else.
  const check = await loadKeypair();
  if (!check || check.publicKey.toBase58() !== kp.publicKey.toBase58()) {
    await clearKeypair();
    throw new Error(
      "We couldn't safely save your wallet to this device's secure storage, so we stopped " +
        "rather than create a wallet you might not be able to reload. Please try again."
    );
  }
}

/** True if any wallet secret is already stored. Read errors propagate (fail closed). */
async function existingWalletPresent(): Promise<boolean> {
  if (await SecureStore.getItemAsync(MNEMONIC)) return true;
  if (await SecureStore.getItemAsync(SECRET_KEY)) return true;
  return false;
}

/**
 * One-time upgrade: rewrite pre-existing secrets (stored before this hardening) with
 * WHEN_UNLOCKED_THIS_DEVICE_ONLY so they leave any device backup. Keychain accessibility
 * only takes effect on write, so old items keep their old attributes until re-stored.
 */
async function migrateHardening(): Promise<void> {
  try {
    if ((await SecureStore.getItemAsync(HARDENED)) === "1") return;
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC);
    const secret = await SecureStore.getItemAsync(SECRET_KEY);
    if (mnemonic) await SecureStore.setItemAsync(MNEMONIC, mnemonic, SECURE_OPTS);
    if (secret) await SecureStore.setItemAsync(SECRET_KEY, secret, SECURE_OPTS);
    await SecureStore.setItemAsync(HARDENED, "1", SECURE_OPTS);
  } catch {
    /* best-effort; never block wallet load */
  }
}

export async function loadKeypair(): Promise<Keypair | null> {
  try {
    await migrateHardening();
    const mnemonic = await SecureStore.getItemAsync(MNEMONIC);
    if (mnemonic) {
      const passphrase = (await SecureStore.getItemAsync(PASSPHRASE)) ?? "";
      return keypairFromMnemonic(mnemonic, passphrase);
    }
    const stored = await SecureStore.getItemAsync(SECRET_KEY);
    if (stored) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(stored) as number[]));
    return null;
  } catch {
    return null;
  }
}

/**
 * Create a fresh mnemonic-backed wallet. Marks it as needing backup. An optional
 * passphrase (the "25th word") is folded into the seed and stored securely; it
 * must be re-entered — alongside the recovery phrase — to ever restore this wallet.
 */
export async function createKeypair(passphrase = ""): Promise<Keypair> {
  // Fail closed: never mint a new wallet on top of an existing one. If a transient
  // keychain read earlier made the app fall back to onboarding, this stops a brand-new
  // seed from silently overwriting — and orphaning the funds of — a real wallet.
  if (await existingWalletPresent()) {
    throw new Error(
      "A wallet already exists on this device. To create a new one, reset your current " +
        "wallet first in Settings — this protects you from overwriting a funded wallet."
    );
  }
  const mnemonic = generateMnemonic();
  const kp = keypairFromMnemonic(mnemonic, passphrase);
  await persist(mnemonic, passphrase, kp);
  await setNeedsBackup(true);
  return kp;
}

/**
 * Restore a wallet from a recovery phrase (plus an optional passphrase). Throws if
 * the phrase itself is invalid. The passphrase cannot be validated — any value is
 * accepted and silently produces a different wallet — so callers should confirm the
 * derived address with the user.
 */
export async function importMnemonic(mnemonic: string, passphrase = ""): Promise<Keypair> {
  const phrase = normalizeMnemonic(mnemonic);
  if (!validateMnemonic(phrase)) {
    throw new Error(
      "That recovery phrase isn't valid. Check for typos and that it's 12 or 24 words in order."
    );
  }
  const kp = keypairFromMnemonic(phrase, passphrase);
  await persist(phrase, passphrase, kp);
  await setNeedsBackup(false); // restored wallets are already backed up
  return kp;
}

/** The stored recovery phrase, or null for legacy wallets without one. */
export async function getMnemonic(): Promise<string | null> {
  return SecureStore.getItemAsync(MNEMONIC);
}

/** The stored BIP39 passphrase, or null if the wallet has none. */
export async function getPassphrase(): Promise<string | null> {
  return SecureStore.getItemAsync(PASSPHRASE);
}

/**
 * The EVM (Ethereum/BSC) account derived from the stored recovery phrase, or null
 * for legacy secret-key-only wallets. Same seed → same 0x address on every EVM chain.
 */
export async function getEvmAccount(): Promise<EvmAccount | null> {
  const mnemonic = await SecureStore.getItemAsync(MNEMONIC);
  if (!mnemonic) return null;
  try {
    const passphrase = (await SecureStore.getItemAsync(PASSPHRASE)) ?? "";
    return deriveEvmAccount(mnemonic, passphrase);
  } catch {
    return null;
  }
}

export async function clearKeypair(): Promise<void> {
  await SecureStore.deleteItemAsync(SECRET_KEY);
  await SecureStore.deleteItemAsync(MNEMONIC);
  await SecureStore.deleteItemAsync(PASSPHRASE);
  await SecureStore.deleteItemAsync(NEEDS_BACKUP);
  await SecureStore.deleteItemAsync(HARDENED);
}
