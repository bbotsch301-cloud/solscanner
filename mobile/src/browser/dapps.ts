/**
 * Curated dApp shortcuts for the browser's Discover home, plus the user's favorites and recent
 * history, persisted in AsyncStorage (non-secret). Load-once + in-memory, mirroring contacts.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export type DappChain = "solana" | "evm" | "multi";

export interface Dapp {
  name: string;
  url: string;
  chain: DappChain;
  blurb: string;
}

/** Featured dApps shown on the Discover home. Edit freely — order is preserved. */
export const FEATURED: Dapp[] = [
  { name: "Jupiter", url: "https://jup.ag", chain: "solana", blurb: "Solana's top swap aggregator" },
  { name: "Raydium", url: "https://raydium.io", chain: "solana", blurb: "AMM & liquidity on Solana" },
  { name: "Tensor", url: "https://www.tensor.trade", chain: "solana", blurb: "Solana NFT marketplace" },
  { name: "Magic Eden", url: "https://magiceden.io", chain: "multi", blurb: "Multi-chain NFT marketplace" },
  { name: "Uniswap", url: "https://app.uniswap.org", chain: "evm", blurb: "Leading EVM DEX" },
  { name: "PancakeSwap", url: "https://pancakeswap.finance", chain: "evm", blurb: "DEX on BNB Chain" },
  { name: "Aave", url: "https://app.aave.com", chain: "evm", blurb: "Lending & borrowing" },
  { name: "OpenSea", url: "https://opensea.io", chain: "evm", blurb: "NFT marketplace" },
  { name: "DeFiLlama", url: "https://defillama.com", chain: "multi", blurb: "DeFi TVL & analytics" },
];

export interface HistoryItem {
  url: string;
  title: string;
  time: number;
}
export interface Favorite {
  url: string;
  title: string;
}

const HISTORY_KEY = "solwallet.browser.history.v1";
const FAV_KEY = "solwallet.browser.favorites.v1";
const HISTORY_MAX = 60;

let history: HistoryItem[] = [];
let favorites: Favorite[] = [];
let loaded = false;

export async function loadBrowserData(): Promise<void> {
  try {
    const [h, f] = await Promise.all([AsyncStorage.getItem(HISTORY_KEY), AsyncStorage.getItem(FAV_KEY)]);
    history = h ? (JSON.parse(h) as HistoryItem[]) : [];
    favorites = f ? (JSON.parse(f) as Favorite[]) : [];
  } catch {
    history = [];
    favorites = [];
  }
  loaded = true;
}

export function listHistory(): HistoryItem[] {
  return history;
}
export function listFavorites(): Favorite[] {
  return favorites;
}

const normalizeUrl = (u: string): string => u.replace(/\/+$/, "");

/** Record a visit (called on navigation). Dedupes consecutive same-url visits and caps the list.
 *  `now` is passed in so callers control the timestamp (render purity). */
export function addHistory(url: string, title: string, now: number): void {
  if (!/^https?:\/\//i.test(url)) return;
  const key = normalizeUrl(url);
  history = [{ url, title: title || key, time: now }, ...history.filter((h) => normalizeUrl(h.url) !== key)].slice(0, HISTORY_MAX);
  if (loaded) AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history)).catch(() => {});
}

export async function clearHistory(): Promise<void> {
  history = [];
  try {
    await AsyncStorage.removeItem(HISTORY_KEY);
  } catch {
    /* best-effort */
  }
}

export function isFavorite(url: string): boolean {
  const key = normalizeUrl(url);
  return favorites.some((f) => normalizeUrl(f.url) === key);
}

/** Toggle a favorite; returns the new state (true = now favorited). */
export function toggleFavorite(url: string, title: string): boolean {
  const key = normalizeUrl(url);
  const exists = favorites.some((f) => normalizeUrl(f.url) === key);
  favorites = exists ? favorites.filter((f) => normalizeUrl(f.url) !== key) : [{ url, title: title || key }, ...favorites];
  if (loaded) AsyncStorage.setItem(FAV_KEY, JSON.stringify(favorites)).catch(() => {});
  return !exists;
}

/** Turn a typed query into a URL: adds https:// to bare domains, else Google-searches it. */
export function toUrl(input: string): string {
  const q = input.trim();
  if (!q) return "";
  if (/^https?:\/\//i.test(q)) return q;
  // Looks like a domain (has a dot, no spaces) → treat as a URL.
  if (/^[^\s]+\.[^\s]{2,}$/.test(q) && !q.includes(" ")) return `https://${q}`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

/** Short display host for a url (no scheme / www / path). */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
