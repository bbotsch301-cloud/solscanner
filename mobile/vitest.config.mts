import { defineConfig } from "vitest/config";

/**
 * The first test runner this project has had.
 *
 * It exists because `property/keyCopy/crypto.ts` — the format that seals members' purchased books
 * and video — carried the comment *"everything here is testable and is tested… caught only by tests
 * that reorder and truncate deliberately, which is why those tests exist."* There were no test files
 * in the repository at all. The format was designed against those attacks and nothing verified the
 * design held.
 *
 * Node environment, not jsdom or a React Native preset. What is worth testing here is deliberately
 * pure — `crypto.ts` opens with "no filesystem, no keychain, no I/O", and that purity is the whole
 * reason it can be checked outside a device. Anything needing a device is not in scope for this
 * runner and should not be made to look like it is.
 *
 * Vitest rather than jest-expo, for two reasons: these are plain modules with no components in them,
 * and the goshen repo already runs vitest — one idiom across the two halves of the system.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
