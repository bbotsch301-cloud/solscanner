/**
 * Chain-agnostic data layer interface.
 *
 * This is the EVM seam: the rest of the app talks only to `ChainAdapter` and the
 * normalized shapes below. A future Alchemy/EVM adapter implements the same
 * interface and slots in behind a chain selector without touching analysis or UI.
 */

export type EntityType = "wallet" | "mint" | "program" | "unknown";

/** A fungible token balance held by an address (decimals already applied to `amount`). */
export interface TokenBalance {
  mint: string;
  /** UI amount (raw / 10^decimals). */
  amount: number;
  rawAmount: string;
  decimals: number;
  symbol?: string;
  name?: string;
  /** Best-effort USD value of the holding, if a price was available. */
  usdValue?: number;
}

/** A holder of a given mint. */
export interface Holder {
  owner: string;
  /** UI amount. */
  amount: number;
  rawAmount: string;
  /** Share of total supply in [0, 1], if supply was known. */
  pct?: number;
}

/** A normalized value transfer between two addresses (one leg of a transaction). */
export interface Transfer {
  signature: string;
  /** Unix seconds. */
  timestamp: number;
  /** Sending address. */
  source: string;
  /** Receiving address. */
  destination: string;
  /** Mint moved, or "SOL" for native lamport transfers. */
  mint: string;
  /** UI amount. */
  amount: number;
  /** Helius transaction type, e.g. TRANSFER, SWAP. */
  type?: string;
}

/** Lightweight account metadata used by heuristics. */
export interface AccountInfo {
  address: string;
  /** Unix seconds of the earliest signature we could find (bounded walk). */
  firstSeen?: number;
  /** Approximate signature count seen during the bounded walk. */
  txCount?: number;
  /** Native SOL balance in lamports. */
  lamports?: number;
}

export interface GetTransfersOptions {
  /** Max enhanced transactions to pull (Helius caps at 100 per page). */
  limit?: number;
  /** Pagination cursor: only fetch transactions before this signature. */
  before?: string;
}

/** Per-address context used to enrich graph node flags (whale/fresh). */
export interface NodeMeta {
  firstSeen?: number;
  holdingPct?: number;
}

export interface ChainAdapter {
  readonly chain: string;
  classify(address: string): Promise<EntityType>;
  getBalances(address: string): Promise<TokenBalance[]>;
  getHolders(mint: string, limit?: number): Promise<Holder[]>;
  getTransfers(address: string, opts?: GetTransfersOptions): Promise<Transfer[]>;
  getAccountInfo(address: string): Promise<AccountInfo>;
  /**
   * Optional: per-address metadata for richer graph flags. Cheap adapters (demo,
   * or future cached backends) implement it; the live Helius adapter omits it to
   * avoid an API call per node, so graph nodes fall back to label-only flags.
   */
  getGraphMeta?(address: string): Promise<Record<string, NodeMeta>>;
}
