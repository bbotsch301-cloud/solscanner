/**
 * Persistent wallet-balance snapshots — so a cold app open paints the last-known balances, tokens,
 * and USD values INSTANTLY (from disk), then refreshes behind (stale-while-revalidate), instead of
 * showing a blank/skeleton while the RPC round-trips. This is the "Phantom-instant" feel.
 *
 * Mirrors the token-metadata cache idiom in solana/tokens.ts: one AsyncStorage entry per scope, a
 * warm in-memory Map preloaded once at startup for synchronous first-render seeding, best-effort
 * writes. `scope` is a network-aware chain+address string built by the caller (e.g. `sol:mainnet-beta:<addr>`
 * or `ethereum:<0x…>`), so mainnet/devnet and each EVM chain stay separate. Type-only imports keep
 * this free of a runtime cycle with WalletContext.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PriceInfo } from "../solana/prices";
import type { EvmTokenBalance } from "../evm/tokens";
import type { SplToken } from "./WalletContext";

const KEY = "wallet.snap.v1:";
// Don't seed from a snapshot older than this — very stale balances would mislead until the refresh
// lands. A week is plenty for "instant open"; anything older just shows a skeleton as before.
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface WalletSnapshot {
  ts: number;
  // Solana scope
  solBalance?: number | null;
  tokens?: SplToken[];
  prices?: Record<string, PriceInfo>;
  // EVM scope
  evmNative?: number | null;
  evmTokens?: EvmTokenBalance[];
  evmPrices?: Record<string, number>;
}

const warm = new Map<string, WalletSnapshot>();

/** Load persisted snapshots into memory (call once at startup, before rendering). */
export async function loadWalletSnapshots(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY));
    if (!keys.length) return;
    for (const [k, raw] of await AsyncStorage.multiGet(keys)) {
      if (!raw) continue;
      try {
        const snap = JSON.parse(raw) as WalletSnapshot;
        if (snap && typeof snap.ts === "number") warm.set(k.slice(KEY.length), snap);
      } catch {
        /* skip a corrupt entry */
      }
    }
  } catch {
    /* best-effort */
  }
}

/** Synchronously read a fresh-enough snapshot for instant seeding, or undefined. */
export function getWalletSnapshot(scope: string): WalletSnapshot | undefined {
  const s = warm.get(scope);
  if (!s || Date.now() - s.ts > MAX_AGE_MS) return undefined;
  return s;
}

/** Write-through: update the warm map + persist (fire-and-forget). */
export function saveWalletSnapshot(scope: string, snap: Omit<WalletSnapshot, "ts">): void {
  const full: WalletSnapshot = { ...snap, ts: Date.now() };
  warm.set(scope, full);
  AsyncStorage.setItem(KEY + scope, JSON.stringify(full)).catch(() => {});
}
