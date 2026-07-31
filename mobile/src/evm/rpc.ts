/**
 * Minimal JSON-RPC client for EVM chains — plain fetch, no provider library.
 */
import type { ChainDef } from "../chains/registry";

let nextId = 1;

async function call<T>(chain: ChainDef, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(chain.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
  if (!res.ok) throw new Error(`RPC ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message || "RPC error");
  return j.result as T;
}

export async function getBalance(chain: ChainDef, address: string): Promise<bigint> {
  return BigInt(await call<string>(chain, "eth_getBalance", [address, "latest"]));
}

/** eth_call to a contract; returns the raw hex result. */
export async function ethCall(chain: ChainDef, to: string, data: string): Promise<string> {
  return call<string>(chain, "eth_call", [{ to, data }, "latest"]);
}

export async function getNonce(chain: ChainDef, address: string): Promise<bigint> {
  return BigInt(await call<string>(chain, "eth_getTransactionCount", [address, "pending"]));
}

export async function estimateGas(
  chain: ChainDef,
  tx: { from: string; to: string; value?: string; data?: string }
): Promise<bigint> {
  return BigInt(await call<string>(chain, "eth_estimateGas", [tx]));
}

export async function sendRawTransaction(chain: ChainDef, rawHex: string): Promise<string> {
  return call<string>(chain, "eth_sendRawTransaction", [rawHex]);
}

/** EIP-1559 fee suggestion: 2×baseFee headroom + a priority tip, with fallbacks. */
export async function getFees(
  chain: ChainDef
): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  let priority = 1_500_000_000n; // 1.5 gwei fallback
  try {
    priority = BigInt(await call<string>(chain, "eth_maxPriorityFeePerGas", []));
  } catch {
    /* keep fallback */
  }
  let base = 0n;
  try {
    const block = await call<{ baseFeePerGas?: string }>(chain, "eth_getBlockByNumber", ["latest", false]);
    if (block?.baseFeePerGas) base = BigInt(block.baseFeePerGas);
  } catch {
    /* pre-1559 or RPC hiccup */
  }
  if (base === 0n) {
    try {
      base = BigInt(await call<string>(chain, "eth_gasPrice", []));
    } catch {
      base = priority;
    }
  }
  const maxFeePerGas = base * 2n + priority;
  return { maxFeePerGas, maxPriorityFeePerGas: priority };
}
