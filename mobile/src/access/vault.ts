/**
 * Proving pass ownership to Steward Vault, so gated content can open in a browser that has no
 * wallet in it.
 *
 * Flow: ask for a challenge → validate what we were asked to sign → biometric confirm → sign →
 * exchange the signature for a short-lived URL → open that URL in a custom tab. The signature is
 * never a URL parameter; it travels in a POST body and is exchanged server-side for an opaque
 * expiring link.
 *
 * Dormant until `EXPO_PUBLIC_VAULT_API` is set — see `attemptGatedUrl` for exactly when it falls
 * back to the public link and when it must not.
 *
 * ============================ CONTRACT (for the platform side) ============================
 *
 * POST {VAULT_API}/v1/access/challenge
 *   req  { mint, wallet, cluster }
 *   200  { challengeId, nonce, domain, message, issuedAt, expiresAt }
 *   404 unknown_asset · 429 rate_limited
 *
 *   The SERVER composes the exact `message` text to sign, so the two sides can never drift.
 *   Canonical form (SIWS-shaped, so a wallet-standard signIn can reuse it later):
 *
 *     {domain} wants you to prove ownership to unlock content.
 *
 *     Wallet: {base58 pubkey}
 *     Asset: {mint}
 *     Chain: solana:{cluster}
 *     Nonce: {nonce}
 *     Issued At: {ISO8601}
 *     Expiration Time: {ISO8601}
 *     Request ID: {challengeId}
 *
 *   Store challengeId → {mint, wallet, nonce, issuedAt, expiresAt, used:false}, TTL 120s.
 *
 * POST {VAULT_API}/v1/access/grant
 *   req  { challengeId, message, signature (base58), publicKey (base58) }
 *   200  { url, viewerUrl?, expiresAt, ttlSeconds, mime?, kind?, title? }
 *   400 malformed · 401 bad_signature · 403 not_owner · 409 nonce_used
 *   410 challenge_expired · 429 rate_limited · 503 upstream_unavailable
 *
 *   Verify IN THIS ORDER, all mandatory:
 *     1. Look up challengeId — 410 if missing/expired, 409 if already used.
 *     2. Re-derive the expected message from your OWN stored fields and compare it byte-for-byte
 *        to the submitted `message`. Never parse the client's text and trust the parts.
 *     3. publicKey === stored.wallet.
 *     4. ed25519.verify(signature, utf8(message), publicKey) — 401 on failure.
 *     5. Mark used = true BEFORE the ownership check (burn on attempt, not on success).
 *     6. Check ownership on-chain at a recent slot. Accept collection-level grants, not only
 *        per-mint — access is normally sold per collection.
 *     7. Mint the signed URL.
 *
 *   Signed URL: https on a vault-controlled host; the token an opaque server-keyed HMAC over
 *   {contentId, walletHash, exp, nonce}. ttlSeconds <= 300 to first byte. Single-use for
 *   pdf/epub/download; exp-only for video/audio (Range requests need repeat GETs).
 *   MUST NOT set cookies — iOS custom tabs share Safari's cookie jar, so a cookie would both
 *   outlive the session and let a stale Safari login bypass the on-chain check entirely.
 *   Headers: Cache-Control: private, no-store · X-Content-Type-Options: nosniff ·
 *   Referrer-Policy: no-referrer. Prefer carrying the token in the URL *fragment* so it stays out
 *   of server, CDN, and Referer logs. Never log the full URL.
 * =========================================================================================
 */
import bs58 from "bs58";
import type { Keypair } from "@solana/web3.js";
import { signMessageUtf8 } from "../solana/signMessage";
import { requireReauth } from "../security/reauth";
import { VAULT_API, VAULT_DOMAIN, vaultConfigured } from "../config/vault";
import { bindsWalletAndDomain } from "./siws";
import { CLUSTER } from "../solana/connection";
import type { Collectible } from "../solana/collectibles";

interface Challenge {
  challengeId: string;
  message: string;
  domain?: string;
  expiresAt?: string;
}

/** Thrown when the vault actively refused — the caller must NOT fall back to the public link. */
export class AccessDeniedError extends Error {}

const TIMEOUT_MS = 12_000;

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; json: T | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${VAULT_API}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Refuse to sign anything that isn't the statement we expect.
 *
 * The vault composes the text, so a compromised or hostile one could hand back a login challenge
 * for some other site and harvest a valid signature for it. Bind it to our key, this asset, and
 * the configured domain before the private key ever touches it.
 */
function challengeIsSafe(message: string, wallet: string, mint: string): boolean {
  // The wallet and domain clauses are shared with sign-in (`access/siws.ts`), which applies the same
  // rule with a purpose in place of the asset. Keeping them in one place is deliberate: this check
  // is the reason a hostile server can't harvest a signature, and two copies of it would drift.
  if (!bindsWalletAndDomain(message, wallet, VAULT_DOMAIN)) return false;
  return message.includes(`Asset: ${mint}`);
}

/**
 * Try to obtain a gated URL for `item`.
 *
 * Returns null to mean "no gating applies — open the public link". Throws AccessDeniedError when
 * the vault said no, which must surface rather than silently falling back; otherwise the gate is
 * theatre, because every refusal would just open the content anyway.
 */
export async function attemptGatedUrl(item: Collectible, wallet: string, kp: Keypair): Promise<string | null> {
  if (!vaultConfigured()) return null;

  let ch: Challenge | null;
  try {
    const r = await postJson<Challenge>("/v1/access/challenge", {
      mint: item.mint,
      wallet,
      cluster: CLUSTER,
    });
    // The vault simply doesn't publish content for this asset — normal for third-party NFTs.
    if (r.status === 404) return null;
    if (r.status === 403) throw new AccessDeniedError("This pass doesn't unlock this content.");
    if (!r.json?.message || !r.json.challengeId) return null; // transport trouble → public link
    ch = r.json;
  } catch (e) {
    if (e instanceof AccessDeniedError) throw e;
    return null; // offline / 5xx / timeout → public link
  }

  if (!challengeIsSafe(ch.message, wallet, item.mint))
    throw new AccessDeniedError("The unlock request didn't match this item, so it wasn't signed.");

  if (!(await requireReauth(`Unlock "${item.name}"`))) return null;

  const signature = bs58.encode(signMessageUtf8(kp, ch.message));
  const g = await postJson<{ url?: string; viewerUrl?: string }>("/v1/access/grant", {
    challengeId: ch.challengeId,
    message: ch.message,
    signature,
    publicKey: wallet,
  });

  // A refusal is meaningful — never paper over it with the public link.
  if (g.status === 403) throw new AccessDeniedError("This pass doesn't unlock this content.");
  if (g.status === 401) throw new AccessDeniedError("The unlock signature was rejected.");
  if (g.status === 409 || g.status === 410)
    throw new AccessDeniedError("That unlock request expired. Please try again.");
  if (!g.json) return null;

  return g.json.viewerUrl ?? g.json.url ?? null;
}
