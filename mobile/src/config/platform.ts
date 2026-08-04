/**
 * The Association platform — the server that verifies who is calling and serves what they own.
 *
 * Unset by default, like `config/vault.ts`: with no endpoint configured, sign-in simply never
 * happens and every surface falls back to the chain and the on-device cache, which is how the app
 * works today. Setting these switches the platform path on with no app release.
 *
 * Falls back to the vault variables because both live on the same host: the server mounts `/v1`
 * under its API prefix, so `EXPO_PUBLIC_VAULT_API=https://host/_api` already resolves
 * `/v1/auth/challenge` correctly and no second variable is needed until the two are split.
 */
import { VAULT_API, VAULT_DOMAIN } from "./vault";

export const PLATFORM_API = process.env.EXPO_PUBLIC_PLATFORM_API ?? VAULT_API;

/**
 * The domain the platform is allowed to name in a challenge — checked before we sign anything.
 *
 * Must match the server's `AUTH_DOMAIN` exactly. If it doesn't, the wallet refuses to sign and the
 * member sees a sign-in that quietly never completes, so a mismatch is a configuration bug that
 * costs a release to find.
 */
export const PLATFORM_DOMAIN = process.env.EXPO_PUBLIC_PLATFORM_DOMAIN ?? VAULT_DOMAIN;

/** Both, for the reason spelled out on `vaultConfigured` — a domain-less challenge is unsignable. */
export function platformConfigured(): boolean {
  return !!PLATFORM_API && !!PLATFORM_DOMAIN;
}
