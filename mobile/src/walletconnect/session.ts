/**
 * Reading what a WalletConnect session actually promised the dApp.
 *
 * Split out of `WalletConnectContext.tsx` for the same reason as `signature.ts`: that file is a React
 * component tree and cannot be loaded by a node test, so these would have had to be duplicated to be
 * checked, and a duplicate only proves itself correct.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The address a session promised for one chain, or null if it named none.
 *
 * A session's `namespaces[ns].accounts` are CAIP-10 strings — `solana:<genesis>:<address>` — so the
 * address is whatever follows the chain id.
 */
export function sessionAccount(session: any, chainId: string): string | null {
  const ns = String(chainId).split(":")[0];
  const accounts: string[] = session?.namespaces?.[ns]?.accounts ?? [];
  const hit = accounts.find((a) => a.startsWith(`${chainId}:`));
  return hit ? hit.slice(String(chainId).length + 1) : null;
}

/**
 * Whether two addresses in a namespace are the same account.
 *
 * The asymmetry is deliberate and load-bearing. EVM addresses are hex whose casing carries only an
 * optional checksum, so comparing them case-sensitively would call one account two. Solana addresses
 * are base58, where case is significant — comparing THOSE case-insensitively would call two
 * different accounts one, which is the direction that lets a request through it should refuse.
 */
export function sameAccount(namespace: string, a: string, b: string): boolean {
  return namespace === "eip155" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
