import type { ConfigContext, ExpoConfig } from "expo/config";

import manifest from "./src/config/env.json";

/**
 * The build config.
 *
 * `app.json` stays where it is and keeps everything static — name, icons, the Android settings, the
 * expo-notifications plugin. This file extends it rather than replacing it: Expo reads `app.json`
 * first and hands it in as `config`, so nothing there has to move for this to exist.
 *
 * It is here for one reason. Every feature in this app that talks to the outside world is gated on
 * an `EXPO_PUBLIC_*` variable, and for the app's whole life none of them have been set. That is
 * invisible until someone tries to use the app and a send times out, or sign-in silently does
 * nothing, or dApp connect opens to a notice. `assertReleaseEnv` makes it visible at the only moment
 * it can still be fixed cheaply: before a build is produced.
 *
 * It deliberately does NOT fire for `expo start`. A development session has to stay startable with
 * an empty `.env` — that is how the app is worked on today, under Expo Go, and refusing to start
 * would trade a real problem for a worse one.
 *
 * Note this file reads `process.env` by computed key, which would be wrong inside the app and is
 * correct here: this runs in Node, where Expo's CLI has already loaded `.env` into a real
 * environment. It reads `env.json` rather than importing `src/config/env.ts` because Expo transpiles
 * *this* file but does not extend that to relative TypeScript imports — the import resolves at
 * runtime and fails. JSON, Node reads natively.
 */

/** EAS sets this for every build; it is absent for `expo start` and for `expo config`. */
const profile = process.env.EAS_BUILD_PROFILE ?? "";

/** Development builds are still builds, but they are not handed to a member. */
const shippingToMembers = profile === "preview" || profile === "production";

function assertReleaseEnv(): void {
  if (!shippingToMembers) return;

  const missing = manifest.filter(
    (v) => v.tier === "release" && (process.env[v.key] ?? "").trim() === "",
  );
  if (missing.length === 0) return;

  const detail = missing.map((v) => `  ${v.key}\n    ${v.what}`).join("\n");

  throw new Error(
    `This build is for members (EAS_BUILD_PROFILE=${profile}) but ${missing.length} required ` +
      `variable${missing.length === 1 ? " is" : "s are"} not set:\n\n${detail}\n\n` +
      `Set them in the EAS build environment (or eas.json's env block) and build again. ` +
      `See mobile/CONFIG.md. If a value genuinely does not apply to this build, change its tier in ` +
      `src/config/env.json rather than working around this check — the tier is the claim about what ` +
      `a member needs, and it should be the thing that is wrong, not the guard.`,
  );
}

const buildConfig = ({ config }: ConfigContext): ExpoConfig => {
  assertReleaseEnv();
  return { ...config, name: config.name ?? "XGO", slug: config.slug ?? "mobile" };
};

export default buildConfig;
