/**
 * Client-side nonce reservation for EVM sends. `eth_getTransactionCount(pending)` alone
 * isn't enough under concurrency: two sends fired before the first reaches the mempool
 * (classically an in-app send racing a WalletConnect `eth_sendTransaction`) both read the
 * same pending nonce and collide — one silently replaces or drops the other.
 *
 * This serializes nonce assignment per (chain, address) with a promise-chain mutex and
 * tracks the highest nonce handed out, so overlapping sends get strictly increasing
 * nonces. The reservation is held until the caller commits (after broadcast) or rolls
 * back (on failure) — a rollback prevents a failed send from leaving a gap that would
 * stall every later transaction.
 */
import type { ChainDef } from "../chains/registry";
import { getNonce } from "./rpc";

const reserved = new Map<string, bigint>(); // highest nonce handed out per key
const tail = new Map<string, Promise<void>>(); // mutex tail per key

const keyOf = (chainId: number, addr: string) => `${chainId}:${addr.toLowerCase()}`;

export interface NonceReservation {
  nonce: bigint;
  /** Call after a successful broadcast — keeps the reservation and releases the lock. */
  commit: () => void;
  /** Call if the send failed — rolls the reservation back and releases the lock. */
  rollback: () => void;
}

/** Reserve the next nonce for (chain, address). Always commit() or rollback() the result. */
export async function reserveNonce(chain: ChainDef, address: string): Promise<NonceReservation> {
  const key = keyOf(chain.evmChainId!, address);
  // Chain this call after any in-flight reservation for the same key (the mutex).
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const prev = tail.get(key) ?? Promise.resolve();
  tail.set(
    key,
    prev.then(() => gate)
  );
  await prev; // our turn — the previous holder has committed/rolled back

  let network: bigint;
  try {
    network = await getNonce(chain, address); // pending count from the node
  } catch (e) {
    release(); // free the mutex so this key isn't deadlocked by our failure
    throw e;
  }
  const last = reserved.get(key);
  const nonce = last != null && last + 1n > network ? last + 1n : network;
  reserved.set(key, nonce);

  let released = false;
  const finish = () => {
    if (!released) {
      released = true;
      release();
    }
  };
  return {
    nonce,
    commit: finish,
    rollback: () => {
      // Only roll back if nothing newer was reserved on top of ours.
      if (reserved.get(key) === nonce) {
        if (nonce > 0n) reserved.set(key, nonce - 1n);
        else reserved.delete(key);
      }
      finish();
    },
  };
}
