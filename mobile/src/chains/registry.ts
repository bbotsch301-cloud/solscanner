/**
 * Chain registry. Solana + the two EVM chains the wallet supports today. EVM chains
 * share one account (see wallet/evm.ts) and differ only by RPC / chainId / symbol.
 * RPC endpoints are overridable via env; the public defaults are fine for light use
 * but rate-limited — set a private RPC for real traffic.
 */
import { nativeLogo } from "../config/logos";

export type ChainKind = "solana" | "evm";
export type ChainId = "solana" | "ethereum" | "bsc";

export interface ChainDef {
  id: ChainId;
  name: string;
  kind: ChainKind;
  /** Native asset symbol + decimals. */
  symbol: string;
  decimals: number;
  /** Brand color for the switcher/badges. */
  color: string;
  /** Native asset logo. */
  logoURI?: string;
  /** EVM only. */
  evmChainId?: number;
  rpc: string;
  explorerTx: (hash: string) => string;
  explorerAddr: (addr: string) => string;
}

export const CHAINS: ChainDef[] = [
  {
    id: "solana",
    name: "Solana",
    kind: "solana",
    symbol: "SOL",
    decimals: 9,
    color: "#14F195",
    logoURI: nativeLogo.solana,
    rpc: "", // Solana uses src/solana/connection.ts
    explorerTx: (h) => `https://solscan.io/tx/${h}`,
    explorerAddr: (a) => `https://solscan.io/account/${a}`,
  },
  {
    id: "ethereum",
    name: "Ethereum",
    kind: "evm",
    symbol: "ETH",
    decimals: 18,
    color: "#627EEA",
    logoURI: nativeLogo.ethereum,
    evmChainId: 1,
    rpc: process.env.EXPO_PUBLIC_ETH_RPC ?? "https://ethereum-rpc.publicnode.com",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
    explorerAddr: (a) => `https://etherscan.io/address/${a}`,
  },
  {
    id: "bsc",
    name: "BNB Smart Chain",
    kind: "evm",
    symbol: "BNB",
    decimals: 18,
    color: "#F0B90B",
    logoURI: nativeLogo.bsc,
    evmChainId: 56,
    rpc: process.env.EXPO_PUBLIC_BSC_RPC ?? "https://bsc-rpc.publicnode.com",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
    explorerAddr: (a) => `https://bscscan.com/address/${a}`,
  },
];

export const DEFAULT_CHAIN: ChainId = "solana";

export function getChain(id: ChainId): ChainDef {
  return CHAINS.find((c) => c.id === id) ?? CHAINS[0];
}
