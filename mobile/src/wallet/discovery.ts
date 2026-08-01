/**
 * Account discovery — on import, scan derivation indices for on-chain activity so a
 * user's EXISTING accounts (e.g. their Phantom accounts 0,1,2…) are found and pulled
 * in automatically, instead of silently hiding funds behind higher indices.
 *
 * For each index we derive the same paths Phantom/MetaMask use (Solana m/44'/501'/i'/0',
 * EVM m/44'/60'/0'/0/i) and check Solana + both EVM chains for a balance or any tx
 * history. Best-effort: RPC failures never block the import — index 0 is always kept.
 */
import { PublicKey } from "@solana/web3.js";
import { keypairFromMnemonic } from "./mnemonic";
import { deriveEvmAccount } from "./evm";
import { connection } from "../solana/connection";
import { getBalance as evmBalance, getNonce } from "../evm/rpc";
import { CHAINS } from "../chains/registry";

const EVM_CHAINS = CHAINS.filter((c) => c.kind === "evm");

async function solanaActive(address: string): Promise<boolean> {
  try {
    const pk = new PublicKey(address);
    if ((await connection.getBalance(pk)) > 0) return true;
    const sigs = await connection.getSignaturesForAddress(pk, { limit: 1 });
    return sigs.length > 0;
  } catch {
    return false;
  }
}

async function evmActive(address: string): Promise<boolean> {
  for (const chain of EVM_CHAINS) {
    try {
      const [bal, nonce] = await Promise.all([evmBalance(chain, address), getNonce(chain, address)]);
      if (bal > 0n || nonce > 0n) return true;
    } catch {
      /* skip this chain */
    }
  }
  return false;
}

export interface DiscoveryProgress {
  scanned: number;
  found: number;
}

export interface DiscoverOptions {
  /** Stop after this many consecutive empty indices (BIP44 gap limit). */
  gap?: number;
  /** Never scan past this index. */
  max?: number;
  onProgress?: (p: DiscoveryProgress) => void;
}

/**
 * Return the sorted list of account indices that have activity (always includes 0).
 * `mnemonic`/`passphrase` are used only to derive addresses locally — nothing is
 * persisted here; the caller imports the seed with the returned indices.
 */
export async function discoverAccounts(
  mnemonic: string,
  passphrase = "",
  opts: DiscoverOptions = {}
): Promise<number[]> {
  const gap = opts.gap ?? 5;
  const max = opts.max ?? 20;
  const found: number[] = [];
  let consecutiveEmpty = 0;

  for (let i = 0; i < max; i++) {
    let active = false;
    try {
      const sol = keypairFromMnemonic(mnemonic, passphrase, i).publicKey.toBase58();
      const evm = deriveEvmAccount(mnemonic, passphrase, i).address;
      active = (await solanaActive(sol)) || (await evmActive(evm));
    } catch {
      active = false;
    }

    if (active) {
      found.push(i);
      consecutiveEmpty = 0;
    } else if (i > 0) {
      consecutiveEmpty++;
    }
    opts.onProgress?.({ scanned: i + 1, found: found.length });
    if (i > 0 && consecutiveEmpty >= gap) break;
  }

  return Array.from(new Set([0, ...found])).sort((a, b) => a - b);
}
