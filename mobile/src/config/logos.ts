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

/** Curated Solana token logos (the swap defaults) from stable sources. */
export const solLogo: Record<string, string> = {
  So11111111111111111111111111111111111111112: nativeLogo.solana, // SOL
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: evmLogo("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"), // USDC (brand)
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: evmLogo("ethereum", "0xdAC17F958D2ee523a2206206994597C13D831ec7"), // USDT (brand)
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "https://static.jup.ag/jup/icon.png", // JUP
  DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I", // BONK
};
