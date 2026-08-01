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

/** Bytecode at an address ("0x" for a normal wallet / EOA, non-empty for a contract). */
export async function getCode(chain: ChainDef, address: string): Promise<string> {
  return call<string>(chain, "eth_getCode", [address, "latest"]);
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

export async function getReceipt(
  chain: ChainDef,
  hash: string
): Promise<{ status?: string } | null> {
  return call<{ status?: string } | null>(chain, "eth_getTransactionReceipt", [hash]);
}

/** Poll until a tx is mined (or timeout). Resolves on inclusion; throws if it reverted. */
export async function waitForTx(chain: ChainDef, hash: string, tries = 40): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const r = await getReceipt(chain, hash).catch(() => null);
    if (r) {
      if (r.status === "0x0") throw new Error("Transaction reverted on-chain.");
      return;
    }
    await new Promise((res) => setTimeout(res, 3000));
  }
  throw new Error("Timed out waiting for the transaction to confirm.");
}

const GWEI = 1_000_000_000n;
// Sanity ceilings: the fee numbers come straight from the RPC, and a malicious or
// compromised endpoint could return an absurd base/priority to trick the wallet into
// signing a transaction willing to overpay enormously. These caps are far above any real
// mainnet gas spike, so honest fees pass untouched while a hostile value is clamped.
const MAX_PRIORITY = 100n * GWEI; // 100 gwei tip
const MAX_BASE = 2_000n * GWEI; // 2000 gwei base fee

/** EIP-1559 fee suggestion: 2×baseFee headroom + a priority tip, capped, with fallbacks. */
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
  // Clamp to the ceilings before anyone signs against these numbers.
  if (priority > MAX_PRIORITY) priority = MAX_PRIORITY;
  if (base > MAX_BASE) base = MAX_BASE;
  const maxFeePerGas = base * 2n + priority;
  return { maxFeePerGas, maxPriorityFeePerGas: priority };
}
