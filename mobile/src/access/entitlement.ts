/**
 * Remembering that ownership was already proved, so coming back to a book isn't starting over.
 *
 * ## The problem this exists for
 *
 * Opening vault content costs a challenge, a biometric prompt, a signature, and a grant. That is
 * correct for the first open and absurd for the second: a member who backgrounds the app to answer a
 * message and returns thirty seconds later has not stopped owning the key, and asking them to prove
 * it again — with a Face ID prompt — is the app doubting something the chain already settled.
 *
 * Worse, it doesn't even work. The granted URL is single-use for documents, so the reader's
 * reconnect after backgrounding gets a 404 that is indistinguishable from a forged link. The member
 * sees their book vanish.
 *
 * ## What this is
 *
 * The grant, kept. Not the content — **the portal to it.** Encrypted at rest, scoped to one mint on
 * one cluster, and valid only as long as the grant itself is. Re-opening inside that window costs
 * nothing: no network, no signature, no prompt. Past it, the caller re-grants, and the reauth grace
 * in `security/reauth.ts` is what keeps that silent too.
 *
 * ## Why it is encrypted
 *
 * A live grant is a bearer URL: anything holding it can read the content until it expires, with no
 * further proof of ownership. That is the whole design of the vault link, and it is why the URL must
 * never sit in AsyncStorage in the clear where a device backup or another process could lift it. The
 * key lives in the keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so it does not travel in a backup and
 * does not survive to another device.
 *
 * The primitive is the one the seed vault already uses — `xchacha20poly1305` from
 * `@noble/ciphers/chacha`, per `wallet/lock.ts`. A second crypto idiom in one app is a second thing
 * to get wrong.
 *
 * ## What it does NOT do
 *
 * It does not extend a grant, and it never invents one. An expired entitlement is dropped, not
 * stretched; the server decides how long a grant lives and this only remembers it for that long.
 * Ownership is still re-derived from the chain by the server on every grant — this shortens the
 * interval between checks to the grant's own lifetime, which is the interval the server already
 * chose.
 */
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { CLUSTER } from "../solana/connection";

/** Matches `wallet/lock.ts` — never leaves the device, never rides a backup. */
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const KEY_NAME = "entitlement.key.v1";
const STORE_PREFIX = "entitlement.v1:";

/** What a grant hands back, kept whole rather than pre-collapsed to one URL. */
export interface Entitlement {
  /** The file itself. */
  url: string;
  /** A viewer page for it, when the vault published one. */
  viewerUrl?: string;
  mime?: string;
  /** Epoch ms. Past this the grant is dead server-side and this entry is dropped. */
  expiresAt: number;
  /**
   * Whether the grant survives being fetched more than once.
   *
   * The vault burns a document link on its first byte and leaves media links alive until they
   * expire. A cached single-use entitlement is therefore only good until something reads it — after
   * that, handing it back would produce a 404, which is the exact failure this module exists to
   * prevent. So single-use entries are dropped as soon as they are handed out.
   *
   * This goes away when the platform makes document links expiry-only (see the note in
   * `API-CONTRACT.md` §3); until it does, the wallet must not pretend otherwise.
   */
  reusable: boolean;
}

interface Stored extends Entitlement {
  /** Which mint this opens, checked on read so a mis-keyed entry can't open the wrong asset. */
  mint: string;
}

const storageKey = (mint: string) => `${STORE_PREFIX}${CLUSTER}:${mint}`;

/** How close to expiry an entitlement stops being worth handing out. */
const SKEW_MS = 10_000;

/** Cached after the first read; the keychain is not a hot path. */
let cachedKey: Uint8Array | null = null;

const b64 = (u: Uint8Array): string => Buffer.from(u).toString("base64");
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, "base64"));

function rand(n: number): Uint8Array {
  const a = new Uint8Array(n);
  (globalThis as unknown as { crypto: Crypto }).crypto.getRandomValues(a);
  return a;
}

/**
 * The key entitlements are sealed under, generated once.
 *
 * Deliberately NOT derived from the wallet seed or wrapped under the PIN. A grant is not funds, and
 * binding it to the seed would mean a perfectly valid cached grant dying on an account switch — the
 * opposite of the point. Losing this key costs nothing: every entitlement it protected was going to
 * expire in minutes anyway.
 */
async function entitlementKey(): Promise<Uint8Array | null> {
  if (cachedKey) return cachedKey;
  try {
    const existing = await SecureStore.getItemAsync(KEY_NAME, SECURE_OPTS);
    if (existing) {
      cachedKey = unb64(existing);
      return cachedKey;
    }
    const fresh = rand(32);
    await SecureStore.setItemAsync(KEY_NAME, b64(fresh), SECURE_OPTS);
    cachedKey = fresh;
    return cachedKey;
  } catch {
    // No keychain, no cache. Degrading to plaintext storage would be the wrong trade: the whole
    // reason to keep a bearer URL is that it is short-lived, and re-granting is merely slower.
    return null;
  }
}

/**
 * Remember a grant for as long as it lives.
 *
 * Never throws — failing to cache costs one extra round trip on the next open, which is strictly
 * better than an unopenable screen.
 */
export async function rememberEntitlement(mint: string, e: Entitlement): Promise<void> {
  if (e.expiresAt <= Date.now()) return; // already dead; nothing worth sealing
  try {
    const key = await entitlementKey();
    if (!key) return;
    const nonce = rand(24);
    const payload: Stored = { ...e, mint };
    const sealed = xchacha20poly1305(key, nonce).encrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
    );
    await AsyncStorage.setItem(
      storageKey(mint),
      JSON.stringify({ n: b64(nonce), c: b64(sealed) }),
    );
  } catch {
    /* best-effort by design */
  }
}

/**
 * A still-valid grant for this mint, or null.
 *
 * A single-use entitlement is **consumed by being returned** — it is handed back once and deleted in
 * the same breath, because the server will refuse the second read and a cached 404 is worse than no
 * cache at all.
 */
export async function liveEntitlement(mint: string): Promise<Entitlement | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(mint));
    if (!raw) return null;

    const key = await entitlementKey();
    if (!key) return null;

    const { n, c } = JSON.parse(raw) as { n: string; c: string };
    // A failed open means a rotated key or a tampered entry. Either way there is nothing to trust.
    const plain = xchacha20poly1305(key, unb64(n)).decrypt(unb64(c));
    const stored = JSON.parse(new TextDecoder().decode(plain)) as Stored;

    // Belt and braces: the storage key already scopes by mint, but an entry that disagrees with its
    // own key would open the wrong asset, and that is not a mistake worth being relaxed about.
    if (stored.mint !== mint) {
      await forgetEntitlement(mint);
      return null;
    }
    // A little runway rather than the bare deadline: a grant with two seconds left will expire
    // mid-request and produce exactly the 404 this module exists to avoid.
    if (stored.expiresAt - SKEW_MS <= Date.now()) {
      await forgetEntitlement(mint);
      return null;
    }

    if (!stored.reusable) await forgetEntitlement(mint);

    return {
      url: stored.url,
      viewerUrl: stored.viewerUrl,
      mime: stored.mime,
      expiresAt: stored.expiresAt,
      reusable: stored.reusable,
    };
  } catch {
    return null;
  }
}

export async function forgetEntitlement(mint: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(mint));
  } catch {
    /* best-effort */
  }
}

/**
 * Drop every cached grant.
 *
 * For the moments when standing might have changed under us and re-proving is the honest thing:
 * locking, switching accounts, switching networks. Cheap — these were minutes from expiring anyway.
 */
export async function clearEntitlements(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(STORE_PREFIX));
    if (keys.length) await AsyncStorage.multiRemove(keys);
  } catch {
    /* best-effort */
  }
}
