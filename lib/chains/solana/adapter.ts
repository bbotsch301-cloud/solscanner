import type {
  AccountInfo,
  ChainAdapter,
  EntityType,
  GetTransfersOptions,
  Holder,
  TokenBalance,
  Transfer,
} from "../types";
import { enhancedTransactionsByAddress, rpc } from "./helius";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const NATIVE = "SOL";
const LAMPORTS_PER_SOL = 1_000_000_000;

/** Shape of the relevant slice of a DAS asset returned by getAssetsByOwner. */
interface DasAsset {
  id: string;
  interface?: string;
  content?: { metadata?: { name?: string; symbol?: string } };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    supply?: number;
    price_info?: { total_price?: number; price_per_token?: number };
  };
}

export const solanaAdapter: ChainAdapter = {
  chain: "solana",

  async classify(address: string): Promise<EntityType> {
    const info = await rpc<{
      value: {
        executable?: boolean;
        owner?: string;
        data?: { parsed?: { type?: string } };
      } | null;
    }>("getAccountInfo", [address, { encoding: "jsonParsed" }], { cache: true });

    const value = info?.value;
    if (!value) return "unknown";
    if (value.executable) return "program";
    if (
      (value.owner === TOKEN_PROGRAM || value.owner === TOKEN_2022_PROGRAM) &&
      value.data?.parsed?.type === "mint"
    ) {
      return "mint";
    }
    if (value.owner === SYSTEM_PROGRAM) return "wallet";
    return "unknown";
  },

  async getBalances(address: string): Promise<TokenBalance[]> {
    const res = await rpc<{ items?: DasAsset[] }>(
      "getAssetsByOwner",
      {
        ownerAddress: address,
        page: 1,
        limit: 1000,
        displayOptions: { showFungible: true, showNativeBalance: true },
      },
      { cache: true }
    );

    const items = res?.items ?? [];
    return items
      .filter((a) => a.token_info && (a.token_info.balance ?? 0) > 0)
      .map((a): TokenBalance => {
        const ti = a.token_info!;
        const decimals = ti.decimals ?? 0;
        const raw = ti.balance ?? 0;
        return {
          mint: a.id,
          rawAmount: String(raw),
          decimals,
          amount: raw / 10 ** decimals,
          symbol: ti.symbol ?? a.content?.metadata?.symbol,
          name: a.content?.metadata?.name,
          usdValue: ti.price_info?.total_price,
        };
      })
      .sort((x, y) => (y.usdValue ?? 0) - (x.usdValue ?? 0));
  },

  async getHolders(mint: string, limit = 100): Promise<Holder[]> {
    // Total supply (for pct) from the DAS asset record.
    let supply: number | undefined;
    let decimals = 0;
    try {
      const asset = await rpc<DasAsset>("getAsset", { id: mint }, { cache: true });
      supply = asset?.token_info?.supply;
      decimals = asset?.token_info?.decimals ?? 0;
    } catch {
      // Supply is best-effort; holders still work without pct.
    }

    // Helius DAS extension: getTokenAccounts by mint returns owner + amount.
    const res = await rpc<{
      token_accounts?: Array<{ owner?: string; amount?: number }>;
    }>(
      "getTokenAccounts",
      { mint, page: 1, limit, options: { showZeroBalance: false } },
      { cache: true }
    );

    const accounts = res?.token_accounts ?? [];
    return accounts
      .filter((t) => t.owner && (t.amount ?? 0) > 0)
      .map((t): Holder => {
        const raw = t.amount ?? 0;
        return {
          owner: t.owner!,
          rawAmount: String(raw),
          amount: raw / 10 ** decimals,
          pct: supply && supply > 0 ? raw / supply : undefined,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  },

  async getTransfers(
    address: string,
    opts: GetTransfersOptions = {}
  ): Promise<Transfer[]> {
    const txns = await enhancedTransactionsByAddress(address, {
      limit: opts.limit ?? 100,
      before: opts.before,
    });

    const transfers: Transfer[] = [];
    for (const tx of txns) {
      for (const tt of tx.tokenTransfers ?? []) {
        if (!tt.fromUserAccount || !tt.toUserAccount) continue;
        transfers.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          source: tt.fromUserAccount,
          destination: tt.toUserAccount,
          mint: tt.mint ?? "unknown",
          amount: tt.tokenAmount ?? 0,
          type: tx.type,
        });
      }
      for (const nt of tx.nativeTransfers ?? []) {
        if (!nt.fromUserAccount || !nt.toUserAccount) continue;
        // Ignore dust / rent-sized lamport moves so the graph stays signal-rich.
        const sol = (nt.amount ?? 0) / LAMPORTS_PER_SOL;
        if (sol <= 0) continue;
        transfers.push({
          signature: tx.signature,
          timestamp: tx.timestamp,
          source: nt.fromUserAccount,
          destination: nt.toUserAccount,
          mint: NATIVE,
          amount: sol,
          type: tx.type,
        });
      }
    }
    return transfers;
  },

  async getAccountInfo(address: string): Promise<AccountInfo> {
    const [balanceRes, sigs] = await Promise.all([
      rpc<{ value?: number }>("getBalance", [address], { cache: true }).catch(
        () => ({ value: undefined })
      ),
      // Bounded walk: most-recent 1000 signatures. firstSeen here is the oldest
      // within that window, which is enough to flag "fresh" wallets cheaply.
      rpc<Array<{ blockTime?: number }>>(
        "getSignaturesForAddress",
        [address, { limit: 1000 }],
        { cache: true }
      ).catch(() => []),
    ]);

    const times = sigs.map((s) => s.blockTime).filter((t): t is number => !!t);
    return {
      address,
      lamports: balanceRes?.value,
      txCount: sigs.length,
      firstSeen: times.length ? Math.min(...times) : undefined,
    };
  },
};
