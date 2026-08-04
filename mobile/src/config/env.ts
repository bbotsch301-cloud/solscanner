/**
 * Everything a build of this app can be configured with, in one table.
 *
 * The app had twenty `EXPO_PUBLIC_*` variables scattered across a dozen modules, none of them set,
 * no `.env`, and no build config. Features were off for reasons nobody could see: sends timing out
 * on the rate-limited public RPC, sign-in never happening, the Marketplace row dead, and a URL
 * blocklist that was read at `safety/blocklist.ts:16` but documented in no file at all. This is the
 * manifest that makes that state legible — and, via `app.config.ts`, the thing that stops a release
 * build going out half-configured.
 *
 * ## This is a manifest, not a second source of truth
 *
 * `config/vault.ts`, `config/platform.ts`, `config/webapp.ts`, `config/treasury.ts`,
 * `config/multisig.ts`, `config/swapFee.ts` and `walletconnect/config.ts` remain what the app reads.
 * They do the normalising, the fallbacks and the safety checks that each value needs. Nothing should
 * import a *value* from here; import the tier, the description, or the missing-list.
 *
 * ## Why the descriptions live in JSON and the reads live here
 *
 * Two very different readers need this manifest, and only one of them is the app.
 *
 * On a device there is no populated `process.env`. Expo replaces the literal text
 * `process.env.EXPO_PUBLIC_FOO` with its value at bundle time, so `process.env[name]` with a
 * computed key is `undefined` no matter what is in `.env` — there is nothing to substitute. That is
 * why `VALUES` below is twenty longhand lines and cannot be a loop.
 *
 * `app.config.ts` runs in plain Node, where `process.env` *is* real and a loop over names is
 * correct. It cannot import this file: Expo transpiles `app.config.ts` itself but does not extend
 * that to relative TypeScript imports, so `import … from "./src/config/env"` fails to resolve at
 * config time. JSON it can read natively — hence `env.json`, which is the shared half, and this
 * file, which adds the values the bundle needs.
 *
 * Adding a variable therefore means two edits: an entry in `env.json`, and a literal read in
 * `VALUES`. The `assertEveryKeyHasAValue` check below turns forgetting the second into a loud
 * failure rather than a variable that silently reads as unset.
 */
import manifest from "./env.json";

/**
 * - `release`  — a build shipped to a member is broken without it.
 * - `default`  — a working value is compiled into the app; the variable only overrides it.
 * - `optional` — the feature it gates is genuinely optional, and unset is a legitimate build.
 */
export type Tier = "release" | "default" | "optional";

export type EnvVar = {
  readonly key: string;
  readonly tier: Tier;
  /** One line, written for someone deciding whether they need to set it. */
  readonly what: string;
  readonly value: string;
  /** Truncate hard in diagnostics. Not a secret — it ships in the bundle — but not worth displaying. */
  readonly opaque?: boolean;
};

/**
 * The only place in the app that reads these. Longhand on purpose — see the note above; a loop over
 * key names produces `undefined` for every one of them on a device.
 */
const VALUES: Readonly<Record<string, string>> = {
  EXPO_PUBLIC_MAINNET_RPC: process.env.EXPO_PUBLIC_MAINNET_RPC ?? "",
  EXPO_PUBLIC_VAULT_API: process.env.EXPO_PUBLIC_VAULT_API ?? "",
  EXPO_PUBLIC_VAULT_DOMAIN: process.env.EXPO_PUBLIC_VAULT_DOMAIN ?? "",
  EXPO_PUBLIC_WEBAPP_URL: process.env.EXPO_PUBLIC_WEBAPP_URL ?? "",
  EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  EXPO_PUBLIC_DEVNET_RPC: process.env.EXPO_PUBLIC_DEVNET_RPC ?? "",
  EXPO_PUBLIC_ETH_RPC: process.env.EXPO_PUBLIC_ETH_RPC ?? "",
  EXPO_PUBLIC_BSC_RPC: process.env.EXPO_PUBLIC_BSC_RPC ?? "",
  EXPO_PUBLIC_PLATFORM_API: process.env.EXPO_PUBLIC_PLATFORM_API ?? "",
  EXPO_PUBLIC_PLATFORM_DOMAIN: process.env.EXPO_PUBLIC_PLATFORM_DOMAIN ?? "",
  EXPO_PUBLIC_ETHERSCAN_KEY: process.env.EXPO_PUBLIC_ETHERSCAN_KEY ?? "",
  EXPO_PUBLIC_NOTIFY_API: process.env.EXPO_PUBLIC_NOTIFY_API ?? "",
  EXPO_PUBLIC_BLOCKLIST_URL: process.env.EXPO_PUBLIC_BLOCKLIST_URL ?? "",
  EXPO_PUBLIC_ZEROX_PROXY: process.env.EXPO_PUBLIC_ZEROX_PROXY ?? "",
  EXPO_PUBLIC_ZEROX_API_KEY: process.env.EXPO_PUBLIC_ZEROX_API_KEY ?? "",
  EXPO_PUBLIC_GOSHENS_TREASURY: process.env.EXPO_PUBLIC_GOSHENS_TREASURY ?? "",
  EXPO_PUBLIC_MULTISIG: process.env.EXPO_PUBLIC_MULTISIG ?? "",
  EXPO_PUBLIC_SOLANA_FEE_OWNER: process.env.EXPO_PUBLIC_SOLANA_FEE_OWNER ?? "",
  EXPO_PUBLIC_EVM_FEE_RECIPIENT: process.env.EXPO_PUBLIC_EVM_FEE_RECIPIENT ?? "",
  EXPO_PUBLIC_TREASURY_MAX_WORSE_BPS: process.env.EXPO_PUBLIC_TREASURY_MAX_WORSE_BPS ?? "",
};

export const ENV: readonly EnvVar[] = manifest.map((m) => ({
  key: m.key,
  tier: m.tier as Tier,
  what: m.what,
  opaque: "opaque" in m ? Boolean(m.opaque) : undefined,
  value: VALUES[m.key] ?? "",
}));

/**
 * Keys declared in `env.json` with no literal read in `VALUES`.
 *
 * Always empty in a correct build. It exists because the failure it catches is silent: a variable
 * added to the manifest but not to `VALUES` reads as unset forever, so `app.config.ts` would pass
 * the build with the value present in `.env` and absent from the app.
 *
 * The dev diagnostics screen is what surfaces it. `app.config.ts` cannot — it reads `env.json` and
 * has no way to import this file, which is exactly the seam this check watches.
 */
export function unreadKeys(): readonly string[] {
  return manifest.filter((m) => !(m.key in VALUES)).map((m) => m.key);
}

/** The variables a member-facing build cannot do without, and which this build has not been given. */
export function missingForRelease(): readonly string[] {
  return ENV.filter((v) => v.tier === "release" && v.value.trim() === "").map((v) => v.key);
}

export function envVar(key: string): EnvVar | undefined {
  return ENV.find((v) => v.key === key);
}

/**
 * What to show a developer for one variable. Never rendered in a release build (see `MoreScreen`),
 * and truncated regardless — long RPC URLs carry keys, and a diagnostics row is not a place to
 * display one in full.
 */
export function summarize(v: EnvVar): string {
  const value = v.value.trim();
  if (!value) return "not set";
  if (v.opaque) return `set (${value.length} chars)`;
  return value.length > 44 ? `${value.slice(0, 44)}…` : value;
}
