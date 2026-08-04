/**
 * The Global Goshens communal treasury address — the single source of truth.
 *
 * This lived as TWO independent literals: one in solana/treasury.ts for the address the Treasury
 * screen DISPLAYS, scans for holdings and reads deposits from, and one in config/swapFee.ts for
 * where swap fees actually LAND. Nothing made them agree. Editing one and missing the other — or
 * setting one env var without the other — left the app advertising a "publicly verifiable"
 * treasury that wasn't where the money went, silently. On a screen whose whole purpose is proof,
 * that's the worst thing it could get wrong, so both now read from here.
 *
 * Splitting the fee sink from the displayed treasury is still possible via
 * EXPO_PUBLIC_SOLANA_FEE_OWNER — it just can't happen by accident any more.
 *
 * No imports on purpose: this is a plain value, and keeping it dependency-free means both the
 * config layer and the Solana layer can read it with no risk of an import cycle.
 */
export const TREASURY_ADDRESS =
  process.env.EXPO_PUBLIC_GOSHENS_TREASURY || "XWm75ufpSEzcJ3fKbuBPMM67rovMkfvJAn3hUvcZNCJ";
