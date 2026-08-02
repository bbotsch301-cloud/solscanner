/**
 * EVM transaction history via the Etherscan V2 unified API — one key + a chainid
 * param covers every EVM chain. Best-effort: without EXPO_PUBLIC_ETHERSCAN_KEY it
 * returns nothing (history is simply hidden, no crash). Free key at dashboard.0x… —
 * i.e. etherscan.io/apis.
 */
import type { ChainDef } from "../chains/registry";
// Produces the chain-agnostic base fields only; activity.ts adds the Solana-side
// classification fields (kind / moveIn / moveOut) that this path doesn't derive yet.
import type { HistoryItem } from "../activity";
import { amount as fmtAmount } from "../theme";

type EvmHistoryItem = Omit<HistoryItem, "kind" | "moveIn" | "moveOut" | "feeSol">;

const KEY = process.env.EXPO_PUBLIC_ETHERSCAN_KEY ?? "";
export const evmHistoryEnabled = Boolean(KEY);

interface EtherscanTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
  txreceipt_status?: string;
}

export async function fetchEvmHistory(
  chain: ChainDef,
  address: string,
  limit = 25
): Promise<EvmHistoryItem[]> {
  if (!KEY || !chain.evmChainId) return [];
  const url =
    `https://api.etherscan.io/v2/api?chainid=${chain.evmChainId}` +
    `&module=account&action=txlist&address=${address}` +
    `&sort=desc&page=1&offset=${limit}&apikey=${KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = (await res.json()) as { status?: string; result?: EtherscanTx[] | string };
    if (j.status !== "1" || !Array.isArray(j.result)) return []; // "0" = no txns / rate-limited
    const owner = address.toLowerCase();
    return j.result.map((t) => {
      const out = (t.from ?? "").toLowerCase() === owner;
      const val = Number(BigInt(t.value ?? "0")) / 1e18;
      return {
        id: t.hash,
        time: Number(t.timeStamp) || null,
        failed: t.isError === "1" || t.txreceipt_status === "0",
        direction: out ? "out" : "in",
        valueLabel: val > 0 ? `${fmtAmount(val)} ${chain.symbol}` : null,
        explorerUrl: chain.explorerTx(t.hash),
      };
    });
  } catch {
    return [];
  }
}
