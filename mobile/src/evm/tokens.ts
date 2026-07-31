/**
 * Curated ERC-20 lists for the EVM chains (major stablecoins for slice 1) + balance
 * reads via eth_call(balanceOf). Note BSC's USDT/USDC are 18-decimals, unlike
 * Ethereum's 6 — getting this wrong misreads balances by 12 orders of magnitude.
 */
import type { ChainDef, ChainId } from "../chains/registry";
import { ethCall } from "./rpc";
import { erc20BalanceOfData } from "./tx";

export interface EvmToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

export const EVM_TOKENS: Record<Exclude<ChainId, "solana">, EvmToken[]> = {
  ethereum: [
    { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", name: "Tether USD", decimals: 6 },
    { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", name: "USD Coin", decimals: 6 },
  ],
  bsc: [
    { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", decimals: 18 },
    { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", name: "USD Coin", decimals: 18 },
  ],
};

export function tokensForChain(id: ChainId): EvmToken[] {
  return id === "solana" ? [] : EVM_TOKENS[id];
}

export interface EvmTokenBalance {
  token: EvmToken;
  /** UI-unit balance (decimals applied). */
  balance: number;
}

/** Read balances for the chain's curated tokens. Best-effort per token. */
export async function fetchEvmTokenBalances(
  chain: ChainDef,
  owner: string
): Promise<EvmTokenBalance[]> {
  const tokens = tokensForChain(chain.id);
  const out = await Promise.all(
    tokens.map(async (token) => {
      try {
        const hex = await ethCall(chain, token.address, erc20BalanceOfData(owner));
        const raw = BigInt(hex === "0x" ? "0x0" : hex);
        return { token, balance: Number(raw) / 10 ** token.decimals };
      } catch {
        return { token, balance: 0 };
      }
    })
  );
  return out;
}
