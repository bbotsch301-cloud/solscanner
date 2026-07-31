/**
 * Mock wallet data so the whole UI is clickable before any real keys or network
 * are wired in. This is deliberately the ONLY source of "funds" right now — no
 * real value is at stake. Phase 2 replaces this with a devnet-backed store.
 */

export interface Token {
  symbol: string;
  name: string;
  mint: string;
  amount: number;
  pricePerToken: number;
  change24h: number; // fraction, e.g. 0.052 = +5.2%
  /** Accent color for the token's avatar. */
  color: string;
}

export type ActivityType = "send" | "receive" | "swap";

export interface Activity {
  id: string;
  type: ActivityType;
  symbol: string;
  amount: number;
  usd: number;
  /** Other party (for send/receive) or "SOL → USDC" (for swap). */
  counterparty: string;
  timestamp: number; // unix seconds
}

export const WALLET_ADDRESS = "7xKXtg2CW3rL9vGhb4mN1sQ8pRfDe5YzUa6JcVnB2Hk";
export const WALLET_LABEL = "Main wallet";
export const NETWORK = "Devnet"; // safe default until mainnet is deliberately enabled

export const tokens: Token[] = [
  { symbol: "SOL", name: "Solana", mint: "So11111111111111111111111111111111111111112", amount: 12.482, pricePerToken: 158.4, change24h: 0.032, color: "#9945FF" },
  { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", amount: 640.12, pricePerToken: 1, change24h: 0.0001, color: "#2775CA" },
  { symbol: "JUP", name: "Jupiter", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", amount: 1820, pricePerToken: 0.86, change24h: -0.041, color: "#14F195" },
  { symbol: "BONK", name: "Bonk", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", amount: 4_200_000, pricePerToken: 0.0000241, change24h: 0.118, color: "#FFB020" },
];

const now = Math.floor(Date.now() / 1000);
const H = 3600;
const D = 86_400;

export const activity: Activity[] = [
  { id: "a1", type: "receive", symbol: "SOL", amount: 5, usd: 792, counterparty: "9wFa…4nQ2", timestamp: now - 2 * H },
  { id: "a2", type: "swap", symbol: "USDC", amount: 100, usd: 100, counterparty: "SOL → USDC", timestamp: now - 6 * H },
  { id: "a3", type: "send", symbol: "USDC", amount: 250, usd: 250, counterparty: "3kRm…8pLd", timestamp: now - 1 * D },
  { id: "a4", type: "receive", symbol: "BONK", amount: 4_200_000, usd: 101.2, counterparty: "Ho1d…2Der", timestamp: now - 2 * D },
  { id: "a5", type: "send", symbol: "JUP", amount: 500, usd: 430, counterparty: "5tzF…uAi9", timestamp: now - 4 * D },
];

export function tokenUsdValue(t: Token): number {
  return t.amount * t.pricePerToken;
}

export function totalUsd(): number {
  return tokens.reduce((s, t) => s + tokenUsdValue(t), 0);
}

export function getToken(symbol: string): Token | undefined {
  return tokens.find((t) => t.symbol === symbol);
}
