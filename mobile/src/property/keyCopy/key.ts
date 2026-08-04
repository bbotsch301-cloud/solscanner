/**
 * The device key every stored copy is sealed under.
 *
 * One key, generated once, held in the keychain as `WHEN_UNLOCKED_THIS_DEVICE_ONLY` — the same terms
 * the seed vault uses. That flag is doing the real work here: it means the key is excluded from
 * device backups and never transfers to another device, so a restored phone or a lifted backup
 * yields ciphertext and nothing that opens it.
 *
 * ## What this defeats, and what it does not
 *
 * **Defeats:** an offline copy of the filesystem — `adb pull` on a debuggable or rooted device, a
 * Finder or iCloud backup, a forensic image. Another app on a non-rooted device, which the sandbox
 * already covers and this covers again. And, most usefully, **files the sweep failed to delete**: a
 * copy that should have gone but didn't is inert without this key, and rotating it makes every such
 * file permanently inert in one operation — the only deletion guaranteed to have taken effect even
 * if every unlink silently failed.
 *
 * **Does not defeat the member.** They hold the device, the keychain and the app; plaintext is
 * decryptable on demand because that is the entire point of storing it. This is not DRM, does not
 * become DRM, and nothing in the interface may suggest it is. A rooted device reads everything.
 *
 * ## Deliberately not wrapped under the PIN, and not derived from the seed
 *
 * Not PIN-wrapped: the delete-on-loss sweep runs at startup, before any unlock, and a key it cannot
 * reach is a sweep that cannot run. A promise to delete matters more here than a marginal gain in
 * confidentiality against an attacker who already has the device.
 *
 * Not seed-derived: a retained copy must survive switching accounts and must not die because someone
 * restored a different seed. The copy belongs to the device, and which member may open it is decided
 * by the manifest and the sweep, not by which key exists.
 */
import * as SecureStore from "expo-secure-store";
import { randomBytes } from "./crypto";

const KEY_NAME = "keycopy.contentKey.v1";
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const b64 = (u: Uint8Array): string => Buffer.from(u).toString("base64");
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

let cached: Uint8Array | null = null;

/**
 * The content key, generating one on first use.
 *
 * Returns null when the keychain is unavailable, and callers must treat that as "no local copies
 * today" rather than falling back to plaintext. Storing content unencrypted because the keychain was
 * busy is exactly the kind of quiet downgrade that makes a stated protection worthless.
 */
export async function contentKey(): Promise<Uint8Array | null> {
  if (cached) return cached;
  try {
    const existing = await SecureStore.getItemAsync(KEY_NAME, SECURE_OPTS);
    if (existing) {
      cached = unb64(existing);
      return cached;
    }
    const fresh = randomBytes(32);
    await SecureStore.setItemAsync(KEY_NAME, b64(fresh), SECURE_OPTS);
    cached = fresh;
    return cached;
  } catch {
    return null;
  }
}

/** Whether a key already exists, without creating one. Startup uses this to spot a restored device. */
export async function hasContentKey(): Promise<boolean> {
  if (cached) return true;
  try {
    return !!(await SecureStore.getItemAsync(KEY_NAME, SECURE_OPTS));
  } catch {
    return false;
  }
}

/**
 * Throw the key away and start again.
 *
 * Every existing copy becomes permanently unopenable, immediately and irreversibly. That is the
 * point: it is the backstop for a wipe, and the one form of deletion that does not depend on the
 * filesystem cooperating.
 */
export async function rotateContentKey(): Promise<void> {
  cached = null;
  try {
    await SecureStore.deleteItemAsync(KEY_NAME, SECURE_OPTS);
  } catch {
    /* the next read generates a fresh one regardless */
  }
}
