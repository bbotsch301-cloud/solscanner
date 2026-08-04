/**
 * Proving control of this wallet to the Association platform.
 *
 * ## NOTHING CALLS `signIn` YET
 *
 * Said here because an audit found it and the file gave no hint. This module is complete and written
 * against endpoints that exist (`/v1/auth/challenge`, `/v1/auth/verify`), but no screen or context
 * has ever asked it for a session, so `signIn`, `cachedSession` and `authHeader` are unreachable in
 * the shipped app. `bindsWalletAndDomain` and `clearSessions` are used — by `access/vault.ts` and
 * `wallet/WalletContext.tsx` respectively — so the file as a whole is live.
 *
 * It is kept rather than deleted because the server half is built and the wiring is the remaining
 * step, not a rewrite. What is NOT acceptable is it being unreachable *and* looking wired up: a
 * reader should not have to grep to learn that the sign-in path is unused.
 *
 * Generalised from `access/vault.ts`, which proves ownership of one *asset* to unlock one piece of
 * content. Same sequence, and the sequence is the point: ask for a challenge → validate what we were
 * asked to sign → biometric confirm → sign → exchange the signature for a short-lived token. The
 * signature never travels as a URL parameter, and the token is never written to disk.
 *
 * Dormant until `EXPO_PUBLIC_PLATFORM_API` (or `EXPO_PUBLIC_VAULT_API`) is set.
 *
 * ## What a token from here means
 *
 * That this wallet holds its key. **Nothing else.** It is not a membership, not an office, not a
 * permission. The server re-derives standing from on-chain ownership on every privileged call, and
 * `identity/membership.ts` derives the same thing locally for display only. A token that carried
 * authority would let standing outlive the key that granted it.
 *
 * ## No refresh, deliberately
 *
 * The session is short (the server issues ≤15 minutes) and there is no renewal endpoint. A refresh
 * token is a long-lived credential, which is exactly what this design exists to avoid — the key is
 * the credential. Expiry means challenging again, which costs one biometric prompt and is the right
 * trade. The token is held **in memory only**: a session that survives the app being killed is a
 * liability, not a convenience.
 *
 * ## The server contract
 *
 * `POST {PLATFORM_API}/v1/auth/challenge`
 *   req  { wallet, purpose, cluster, domain? }
 *   200  { challengeId, nonce, domain, message, issuedAt, expiresAt }   TTL 120s
 *   400 malformed · 400 cluster_mismatch · 400 domain_mismatch · 429 rate_limited
 *
 * `POST {PLATFORM_API}/v1/auth/verify`
 *   req  { challengeId, message, signature (base58), publicKey (base58) }
 *   200  { token, expiresAt, wallet }
 *   400 malformed · 400 message_mismatch · 401 bad_signature · 409 nonce_used
 *   410 challenge_expired · 429 rate_limited
 */
import bs58 from "bs58";
import type { Keypair } from "@solana/web3.js";
import { signMessageUtf8 } from "../solana/signMessage";
import { requireReauth } from "../security/reauth";
import { PLATFORM_API, PLATFORM_DOMAIN, platformConfigured } from "../config/platform";
import { CLUSTER } from "../solana/connection";

/** A short, stable string naming what a signature is for. It appears in the text the member reads. */
export type AuthPurpose = "sign-in" | "marketplace" | `community:${string}`;

export interface WalletSession {
  token: string;
  wallet: string;
  /** ms since epoch. */
  expiresAt: number;
}

/**
 * Thrown when the platform actively refused, or when the challenge failed our own safety check.
 *
 * Distinct from returning null: null means "no platform configured, or we couldn't reach it" and the
 * caller should carry on offline. This means something said no, and the member should be told.
 */
export class AuthRejectedError extends Error {}

const TIMEOUT_MS = 12_000;

/** Re-challenge a little before the token dies, so a call doesn't fail on a boundary. */
const EXPIRY_SKEW_MS = 30_000;

interface Challenge {
  challengeId: string;
  message: string;
  domain?: string;
  expiresAt?: string;
}

async function postJson<T>(path: string, body: unknown): Promise<{ status: number; json: T | null }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${PLATFORM_API}${path}`, {
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
 * The server composes the text, so a compromised or hostile one could hand back a login challenge
 * for some other site and harvest a valid signature for it. Bind it to our key, this purpose, and
 * the configured domain before the private key ever touches it.
 *
 * This is the general form of the check `access/vault.ts` applies to one asset, and it has to hold
 * for **every** platform challenge — a signature is worth exactly as much as the discipline of the
 * thing that decided to produce it.
 *
 * Note the domain test is a substring: it can only tell us our domain appears somewhere in the text,
 * not that it is the one being claimed. That is why the server is the one that decides the domain
 * and refuses a mismatch, rather than echoing whatever a caller asks for.
 */
export function challengeIsSafe(message: string, wallet: string, purpose: string): boolean {
  if (!bindsWalletAndDomain(message, wallet, PLATFORM_DOMAIN)) return false;
  return message.includes(`Purpose: ${purpose}`);
}

/**
 * The two assertions every platform challenge has to satisfy, whatever it is for.
 *
 * Shared so the vault's asset-bound check and the general purpose-bound one above cannot drift
 * apart — they are the same rule with a different third clause, and this is the rule. The domain is
 * a parameter rather than read from config here because the two callers are configured separately
 * and one silently adopting the other's domain would be a security change disguised as a refactor.
 */
export function bindsWalletAndDomain(message: string, wallet: string, domain: string): boolean {
  if (!message.includes(`Wallet: ${wallet}`)) return false;
  // An unconfigured domain used to SKIP this clause — `if (domain && …)` — which meant the check
  // that stops a hostile server harvesting a signature for somewhere else was silently absent for
  // exactly the deployments most likely to be misconfigured. A missing domain is not permission to
  // sign anything; it is a reason to sign nothing.
  //
  // In practice this is a second line: `vaultConfigured`/`platformConfigured` now require the domain
  // too, so a half-configured build leaves the gated path off rather than on-and-unbound. This is
  // here because the function is exported and shared, and a future caller should not be able to
  // reintroduce the hole by passing "".
  if (!domain) return false;
  if (!message.includes(domain)) return false;
  return true;
}

// In-memory only, keyed by `wallet:purpose` — see the header. Cleared when the process dies, which
// is the intent.
const sessions = new Map<string, WalletSession>();

const keyFor = (wallet: string, purpose: string): string => `${wallet}:${purpose}`;

function live(s: WalletSession | undefined): WalletSession | null {
  if (!s) return null;
  return s.expiresAt - EXPIRY_SKEW_MS > Date.now() ? s : null;
}

/** The current session for this wallet and purpose, if one is still good. Never hits the network. */
export function cachedSession(wallet: string, purpose: AuthPurpose = "sign-in"): WalletSession | null {
  return live(sessions.get(keyFor(wallet, purpose)));
}

/** Drop a wallet's sessions — on lock, on wallet switch, on any security event. */
export function clearSessions(wallet?: string): void {
  if (!wallet) {
    sessions.clear();
    return;
  }
  for (const k of sessions.keys()) if (k.startsWith(`${wallet}:`)) sessions.delete(k);
}

/**
 * Get a usable session, signing in if we don't already have one.
 *
 * Returns null when there is nothing to talk to, or when the network is unavailable, or when the
 * member declined the biometric prompt — all of which mean "carry on without a session" rather than
 * "show an error". Throws `AuthRejectedError` when the platform actively refused, because a refusal
 * that silently looks like being offline is a refusal nobody can act on.
 */
export async function signIn(
  wallet: string,
  kp: Keypair,
  purpose: AuthPurpose = "sign-in",
): Promise<WalletSession | null> {
  if (!platformConfigured()) return null;

  const existing = cachedSession(wallet, purpose);
  if (existing) return existing;

  let ch: Challenge;
  try {
    const r = await postJson<Challenge & { code?: string; expected?: string }>("/v1/auth/challenge", {
      wallet,
      purpose,
      cluster: CLUSTER,
      domain: PLATFORM_DOMAIN || undefined,
    });

    // Both of these mean the app and the server disagree about what they are. No amount of retrying
    // fixes it and the body says exactly what was expected, so surface it rather than degrading —
    // a silent failure here reads as "sign-in is broken" and takes a release to diagnose.
    if (r.status === 400 && r.json?.code === "cluster_mismatch")
      throw new AuthRejectedError(
        `This server signs for ${r.json.expected ?? "a different network"}; the wallet is on ${CLUSTER}.`,
      );
    if (r.status === 400 && r.json?.code === "domain_mismatch")
      throw new AuthRejectedError("The sign-in request named a different site, so it wasn't sent.");

    if (r.status === 429) return null; // rate limited — back off, try later
    if (!r.json?.message || !r.json.challengeId) return null; // transport trouble → no session
    ch = r.json;
  } catch (e) {
    if (e instanceof AuthRejectedError) throw e;
    return null; // offline / 5xx / timeout → carry on without a session
  }

  if (!challengeIsSafe(ch.message, wallet, purpose))
    throw new AuthRejectedError("The sign-in request didn't match this wallet, so it wasn't signed.");

  // Declining is a choice, not a failure. No session, no error.
  if (!(await requireReauth("Sign in to the Association"))) return null;

  const signature = bs58.encode(signMessageUtf8(kp, ch.message));
  const v = await postJson<{ token?: string; expiresAt?: string; wallet?: string }>("/v1/auth/verify", {
    challengeId: ch.challengeId,
    message: ch.message,
    signature,
    publicKey: wallet,
  });

  // The challenge is spent or dead. The server burns the nonce on receipt, so this is also what a
  // retry of a failed attempt looks like — either way the answer is a fresh challenge, not a retry.
  if (v.status === 409 || v.status === 410)
    throw new AuthRejectedError("That sign-in request expired. Please try again.");
  if (v.status === 401) throw new AuthRejectedError("The sign-in signature was rejected.");
  if (v.status === 400) throw new AuthRejectedError("That sign-in request could not be read.");
  if (v.status === 429) return null;

  const expiresAt = v.json?.expiresAt ? Date.parse(v.json.expiresAt) : NaN;
  if (!v.json?.token || !Number.isFinite(expiresAt)) return null;

  const session: WalletSession = { token: v.json.token, wallet, expiresAt };
  sessions.set(keyFor(wallet, purpose), session);
  return session;
}

/**
 * `Authorization` header for a platform call, or null when there is no session.
 *
 * Bearer, never a cookie: iOS opens links in a tab that shares Safari's cookie jar, so a cookie
 * would outlive the session and let a stale browser login walk past an ownership check.
 */
export function authHeader(wallet: string, purpose: AuthPurpose = "sign-in"): Record<string, string> | null {
  const s = cachedSession(wallet, purpose);
  return s ? { authorization: `Bearer ${s.token}` } : null;
}
