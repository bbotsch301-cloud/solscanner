import { Connection, clusterApiUrl } from "@solana/web3.js";
import * as SecureStore from "expo-secure-store";
import { throttledFetch } from "./rpcThrottle";

// Route every RPC request through the shared throttle so parallel bursts stay under the
// public endpoint's rate limit (fewer 429s). "confirmed" commitment for all connections.
// disableRetryOnRateLimit: our throttle already retries a 429 quietly, so this stops web3.js
// from ALSO retrying it and logging the noisy "Server responded with 429…" console.error.
const CONNECTION_CONFIG = {
  commitment: "confirmed",
  fetch: throttledFetch,
  disableRetryOnRateLimit: true,
} as const;

/**
 * Runtime-switchable network. The choice is persisted and applied at startup
 * (see loadNetworkPref, called from App before rendering). The Settings toggle
 * changes it with setNetwork() + an app reload.
 *
 * Mainnet = REAL FUNDS. Set EXPO_PUBLIC_MAINNET_RPC to a Helius URL below; the
 * public endpoint is rate-limited and swaps may fail on it.
 */
export type Network = "devnet" | "mainnet-beta";

const PREF_KEY = "solwallet.network.v1";
const RPC_PREF_KEY = "solwallet.rpc.mainnet.v1"; // user-set custom mainnet RPC (overrides the default)
const DEFAULT_NETWORK: Network = "mainnet-beta";

// 👉 Paste your Helius RPC URLs here (recommended). The public endpoints are heavily
// rate-limited, which makes sends (especially Token-2022 + account creation) time out.
const MAINNET_RPC =
  process.env.EXPO_PUBLIC_MAINNET_RPC || "https://api.mainnet-beta.solana.com";
const DEVNET_RPC = process.env.EXPO_PUBLIC_DEVNET_RPC || clusterApiUrl("devnet");

// A custom mainnet RPC the user pastes in Settings (persisted). Takes precedence over the env/default
// so history-heavy features (treasury deposits) work without a rebuild. Devnet keeps its default.
let customMainnetRpc: string | null = null;

function rpcFor(n: Network): string {
  if (n === "mainnet-beta") return customMainnetRpc || MAINNET_RPC;
  return DEVNET_RPC;
}

/** Whether the active mainnet RPC is the rate-limited public endpoint (used to warn in the UI). */
export function isPublicRpc(): boolean {
  return rpcFor("mainnet-beta") === "https://api.mainnet-beta.solana.com";
}

/** The custom mainnet RPC the user set, or null when on the default. */
export function getCustomRpc(): string | null {
  return customMainnetRpc;
}

// Mutable live-binding exports — reassigned by apply(); consumers read them at
// call time (after startup config), so they always see the active network.
export let NETWORK: Network = DEFAULT_NETWORK;
export let IS_MAINNET = NETWORK === "mainnet-beta";
export let CLUSTER: Network = NETWORK;
export let connection = new Connection(rpcFor(NETWORK), CONNECTION_CONFIG);

function apply(n: Network): void {
  NETWORK = n;
  IS_MAINNET = n === "mainnet-beta";
  CLUSTER = n;
  connection = new Connection(rpcFor(n), CONNECTION_CONFIG);
}

/** Load the saved network choice. Call once at startup, before rendering. */
export async function loadNetworkPref(): Promise<void> {
  try {
    const saved = (await SecureStore.getItemAsync(PREF_KEY)) as Network | null;
    if (saved === "devnet" || saved === "mainnet-beta") apply(saved);
  } catch {
    /* keep default */
  }
}

/** Load the saved custom mainnet RPC (if any) and rebuild the connection to use it. Call at startup. */
export async function loadRpcPref(): Promise<void> {
  try {
    const saved = await SecureStore.getItemAsync(RPC_PREF_KEY);
    if (saved && /^https:\/\//i.test(saved)) {
      customMainnetRpc = saved;
      apply(NETWORK); // rebuild with the custom RPC for the active network
    }
  } catch {
    /* keep default */
  }
}

/** Persist + apply a custom mainnet RPC (pass null to clear back to the default). Reload after. */
export async function setCustomRpc(url: string | null): Promise<void> {
  const clean = url?.trim() || null;
  try {
    if (clean) await SecureStore.setItemAsync(RPC_PREF_KEY, clean);
    else await SecureStore.deleteItemAsync(RPC_PREF_KEY);
  } catch {
    /* best-effort persistence */
  }
  customMainnetRpc = clean;
  apply(NETWORK);
}

/** Persist + apply a network choice (reload the app afterwards to reset state). */
export async function setNetwork(n: Network): Promise<void> {
  await SecureStore.setItemAsync(PREF_KEY, n);
  apply(n);
}

function clusterParam(): string {
  return IS_MAINNET ? "" : "?cluster=devnet";
}

export function solscanTx(signature: string): string {
  return `https://solscan.io/tx/${signature}${clusterParam()}`;
}

export function solscanAccount(address: string): string {
  return `https://solscan.io/account/${address}${clusterParam()}`;
}
