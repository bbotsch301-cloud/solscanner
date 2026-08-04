/**
 * What to say when a feature is switched off because the build wasn't configured for it.
 *
 * The rule this exists to enforce:
 *
 *   **A developer build names the variable. A release build never does.**
 *
 * The wallet was breaking that rule in two places — the dApp-connect screen and the EVM history
 * empty state — both printing `Set EXPO_PUBLIC_…` into the interface. A member cannot act on that
 * sentence. They have no `.env`, no Metro, and no reason to know what an environment variable is;
 * all it tells them is that something is broken and they are somehow at fault.
 *
 * `__DEV__` is already how this app draws that line: `App.tsx` registers the Deed preview route only
 * in development so a release build has no route to it at all. Same gate, same reasoning.
 *
 * A note on what this is *not* for. If a feature is off in a release build, that is a mistake made
 * at build time, and `app.config.ts` is what should have caught it. This is the last line — honest
 * copy for a state that should never reach anyone — not a substitute for the guard.
 */

/**
 * @param key        the variable a developer needs to set
 * @param member     what to tell someone who cannot set it — plain, and never an instruction
 * @param hint       optional extra for the developer only (where to get the value)
 */
export function configNotice(key: string, member: string, hint?: string): string {
  if (!__DEV__) return member;
  return hint ? `${member}\n\nDev: set ${key} and restart with -c. ${hint}` : `${member}\n\nDev: set ${key} and restart with -c.`;
}
