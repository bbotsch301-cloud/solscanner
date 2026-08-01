/**
 * Reliable, keyless token/native logos. The old solana-labs/token-list URLs are dead
 * (that repo was archived → 404), so we use Trust Wallet's actively-maintained asset
 * CDN plus a few official token CDNs. TokenAvatar falls back to initials if any URL
 * 404s, so a miss is harmless.
 */
const TW = "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains";

/** Native asset logos, keyed by chain id. */
export const nativeLogo: Record<string, string> = {
  solana: `${TW}/solana/info/logo.png`,
  ethereum: `${TW}/ethereum/info/logo.png`,
  bsc: `${TW}/smartchain/info/logo.png`,
};

/** Trust Wallet logo for an EVM token by its checksummed address. */
export const evmLogo = (chain: "ethereum" | "smartchain", address: string): string =>
  `${TW}/${chain}/assets/${address}/logo.png`;

/** Trust Wallet logo for a Solana token by its mint — same repo/host as the working
 *  SOL native logo, so it loads wherever the natives do. */
export const solAsset = (mint: string): string => `${TW}/solana/assets/${mint}/logo.png`;

/**
 * Manual logo overrides by mint — highest priority, for tokens no source resolves
 * (unpooled pump.fun tokens whose on-chain image is IPFS-only). Add `mint: url` here.
 */
export const LOGO_OVERRIDES: Record<string, string> = {
  // Add `mint: "https://…"` here to force a specific logo. (Giraffe's dead DexScreener CDN
  // override was removed — its real image now resolves on-chain via the pump.fun IPFS gateway.)
};

/** Curated Solana token logos (the swap defaults), all on the one working pattern. */
export const solLogo: Record<string, string> = {
  So11111111111111111111111111111111111111112: nativeLogo.solana, // SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: solAsset("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"), // USDC
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: solAsset("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"), // USDT
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: solAsset("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"), // JUP
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: solAsset("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"), // BONK
};
