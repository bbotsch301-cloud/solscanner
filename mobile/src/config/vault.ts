/**
 * Steward Vault — the platform that verifies pass ownership and serves the gated content.
 *
 * Unset by default: until an endpoint exists, every pass simply opens its public link (see
 * `access/vault.ts`). Setting these switches the gated path on with no app release.
 */
export const VAULT_API = process.env.EXPO_PUBLIC_VAULT_API ?? "";
/** The domain the vault is allowed to name in a challenge — checked before we sign anything. */
export const VAULT_DOMAIN = process.env.EXPO_PUBLIC_VAULT_DOMAIN ?? "";

/**
 * Both, not either.
 *
 * This used to require only `VAULT_API`, which meant a deployment that set the endpoint and forgot
 * the domain switched the gated path ON with the domain binding skipped — the wallet would sign a
 * challenge composed by the server without ever checking which site it named. Half-configured now
 * behaves exactly like unconfigured: public links, no signature, no gated path. Blank is documented
 * as a working no-op, so that is the honest reading of a missing value.
 *
 * The misconfiguration itself is not hidden: `EXPO_PUBLIC_VAULT_DOMAIN` is release-tier in
 * `config/env.json`, so it shows red in More → Build configuration and `app.config.ts` refuses a
 * member-facing build without it.
 */
export function vaultConfigured(): boolean {
  return !!VAULT_API && !!VAULT_DOMAIN;
}
