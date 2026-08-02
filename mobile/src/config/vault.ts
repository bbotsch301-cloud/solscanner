/**
 * Steward Vault — the platform that verifies pass ownership and serves the gated content.
 *
 * Unset by default: until an endpoint exists, every pass simply opens its public link (see
 * `access/vault.ts`). Setting these switches the gated path on with no app release.
 */
export const VAULT_API = process.env.EXPO_PUBLIC_VAULT_API ?? "";
/** The domain the vault is allowed to name in a challenge — checked before we sign anything. */
export const VAULT_DOMAIN = process.env.EXPO_PUBLIC_VAULT_DOMAIN ?? "";

export function vaultConfigured(): boolean {
  return !!VAULT_API;
}
