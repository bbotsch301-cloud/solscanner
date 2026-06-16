/**
 * Demo adapter: implements the same ChainAdapter interface over the static demo
 * dataset, so every route, the analysis layer, and the graph UI work end-to-end
 * with no Helius key. Used when a request carries ?demo=1.
 */
import type {
  AccountInfo,
  ChainAdapter,
  EntityType,
  Holder,
  NodeMeta,
  TokenBalance,
  Transfer,
} from "../chains/types";
import { getDemoDataset } from "./dataset";

export const demoAdapter: ChainAdapter = {
  chain: "solana-demo",

  async classify(address: string): Promise<EntityType> {
    return getDemoDataset().classify[address] ?? "wallet";
  },

  async getBalances(address: string): Promise<TokenBalance[]> {
    return getDemoDataset().balancesByOwner[address] ?? [];
  },

  async getHolders(): Promise<Holder[]> {
    return getDemoDataset().holders;
  },

  async getTransfers(address: string): Promise<Transfer[]> {
    const { transfers } = getDemoDataset();
    return transfers.filter(
      (t) => t.source === address || t.destination === address
    );
  },

  async getAccountInfo(address: string): Promise<AccountInfo> {
    return getDemoDataset().accountInfo[address] ?? { address };
  },

  async getGraphMeta(): Promise<Record<string, NodeMeta>> {
    return getDemoDataset().graphMeta;
  },
};
