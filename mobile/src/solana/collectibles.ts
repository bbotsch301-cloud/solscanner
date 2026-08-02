/**
 * The user's Collection — the non-fungible assets (access passes, tickets, books, memberships, art)
 * their wallet owns. The artwork IS the item: this layer resolves each asset's image, name,
 * collection, and kind so the UI can render a gallery of real-looking things, and (via
 * `external_url`) the portal each pass will eventually open.
 *
 * Sources, best-first:
 *   • DAS `getAssetsByOwner` on a Helius-capable RPC — one call returns everything with metadata,
 *     artwork, collection grouping, and verification flags.
 *   • Public-RPC fallback — NFT-shaped token accounts (decimals 0, amount 1) + the existing
 *     token-metadata resolver (Jupiter/DexScreener/on-chain Metaplex) for name/image. Degraded but
 *     functional without any API key.
 *
 * Spam: every active wallet gets airdropped junk. Items in an unverified collection with no artwork
 * start in "Hidden"; the user can hide/unhide anything, persisted on-device. The last-good list is
 * also persisted per (cluster, address) so a cold open paints the gallery instantly.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { connection, CLUSTER, isPublicRpc } from "./connection";
import { fetchTokenMetas } from "./tokens";

export type CollectibleKind = "ticket" | "membership" | "book" | "portal" | "file" | "art";

export interface Collectible {
  mint: string;
  name: string;
  image?: string;
  description?: string;
  collection?: string;
  collectionVerified: boolean;
  kind: CollectibleKind;
  externalUrl?: string;
  attributes?: { trait: string; value: string }[];
  compressed: boolean;
  /** Plain SPL transfer works (standard, non-compressed, non-programmable). */
  transferable: boolean;
  /** Started in Hidden by the spam heuristic (unverified collection + no artwork). */
  likelySpam: boolean;
}

const HIDDEN_KEY = "collectibles.hidden.v1";
const SNAP_KEY = "collectibles.snap.v1:";
const SNAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const KIND_VALUES: CollectibleKind[] = ["ticket", "membership", "book", "portal", "file", "art"];

// ---- Hidden overrides (user-controlled, persisted; load-once + write-through like pubAddresses).
// Spam-looking items default to hidden; an explicit user choice (either way) wins. ----

let hiddenOverrides = new Map<string, boolean>();
const hiddenListeners = new Set<() => void>();

export async function loadCollectiblePrefs(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    if (raw) hiddenOverrides = new Map(Object.entries(JSON.parse(raw) as Record<string, boolean>));
  } catch {
    /* best-effort */
  }
}

/** Effective visibility: the user's explicit choice, else hidden-by-default for spam-looking items. */
export function isHiddenItem(c: Collectible): boolean {
  return hiddenOverrides.get(c.mint) ?? c.likelySpam;
}

export function setHidden(mint: string, v: boolean): void {
  hiddenOverrides.set(mint, v);
  AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Object.fromEntries(hiddenOverrides))).catch(() => {});
  hiddenListeners.forEach((fn) => fn());
}

/** Subscribe to hide/unhide changes so an open gallery re-splits its sections. Returns unsubscribe. */
export function onHiddenChange(fn: () => void): () => void {
  hiddenListeners.add(fn);
  return () => {
    hiddenListeners.delete(fn);
  };
}

// ---- Persistent last-good snapshot (instant gallery paint on cold open) ----

const warmSnap = new Map<string, { items: Collectible[]; ts: number }>();

export async function loadCollectibleSnapshots(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(SNAP_KEY));
    if (!keys.length) return;
    for (const [k, raw] of await AsyncStorage.multiGet(keys)) {
      if (!raw) continue;
      try {
        const snap = JSON.parse(raw) as { items?: Collectible[]; ts?: number };
        if (Array.isArray(snap.items) && typeof snap.ts === "number")
          warmSnap.set(k.slice(SNAP_KEY.length), { items: snap.items, ts: snap.ts });
      } catch {
        /* skip a corrupt entry */
      }
    }
  } catch {
    /* best-effort */
  }
}

const scopeFor = (owner: string) => `sol:${CLUSTER}:${owner}`;

/** Synchronously read the last-good list for instant seeding, or undefined. */
export function cachedCollectibles(owner: string): Collectible[] | undefined {
  const s = warmSnap.get(scopeFor(owner));
  if (!s || Date.now() - s.ts > SNAP_MAX_AGE_MS) return undefined;
  return s.items;
}

function saveSnapshot(owner: string, items: Collectible[]): void {
  const scope = scopeFor(owner);
  warmSnap.set(scope, { items, ts: Date.now() });
  AsyncStorage.setItem(SNAP_KEY + scope, JSON.stringify({ items, ts: Date.now() })).catch(() => {});
}

const itemsListeners = new Set<() => void>();

/** Subscribe to local list changes (e.g. an item sent away). Returns unsubscribe. */
export function onCollectiblesChange(fn: () => void): () => void {
  itemsListeners.add(fn);
  return () => {
    itemsListeners.delete(fn);
  };
}

/**
 * Drop an item locally right after it's transferred away, so it disappears from the gallery
 * immediately instead of lingering until the next refetch (the chain takes a moment to reflect it).
 */
export function removeCollectible(owner: string, mint: string): void {
  const s = warmSnap.get(scopeFor(owner));
  if (s) saveSnapshot(owner, s.items.filter((c) => c.mint !== mint));
  itemsListeners.forEach((fn) => fn());
}

// ---- Fetching ----

function parseKind(attrs: { trait: string; value: string }[] | undefined): CollectibleKind {
  const t = attrs?.find((a) => /^(type|kind)$/i.test(a.trait))?.value?.toLowerCase();
  return (KIND_VALUES as string[]).includes(t ?? "") ? (t as CollectibleKind) : "art";
}

// Minimal shape of the DAS response parts we read.
interface DasAsset {
  id: string;
  interface?: string;
  burnt?: boolean;
  compression?: { compressed?: boolean };
  grouping?: { group_key?: string; group_value?: string; verified?: boolean }[];
  content?: {
    metadata?: { name?: string; symbol?: string; description?: string; attributes?: { trait_type?: string; value?: unknown }[] };
    links?: { image?: string; external_url?: string };
    files?: { uri?: string }[];
  };
  token_info?: { balance?: number; decimals?: number };
}

const DAS_PAGE_SIZE = 500;
const DAS_MAX_PAGES = 5; // 2500 items — far beyond any real wallet, but bounds a runaway loop

/** One page of `getAssetsByOwner`. Returns null on any failure (caller falls back). */
async function fetchDasPage(owner: string, page: number): Promise<DasAsset[] | null> {
  const res = await fetch(connection.rpcEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "collectibles",
      method: "getAssetsByOwner",
      params: {
        ownerAddress: owner,
        page,
        limit: DAS_PAGE_SIZE,
        displayOptions: { showUnverifiedCollections: true, showCollectionMetadata: false },
      },
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: { items?: DasAsset[] } };
  return Array.isArray(json.result?.items) ? json.result.items : null;
}

/** DAS path — full metadata/artwork, paged so large wallets aren't silently truncated.
 *  Returns null to signal "use the fallback". */
async function fetchViaDas(owner: string): Promise<Collectible[] | null> {
  try {
    const items: DasAsset[] = [];
    for (let page = 1; page <= DAS_MAX_PAGES; page++) {
      const batch = await fetchDasPage(owner, page);
      if (batch === null) return page === 1 ? null : items.length ? mapDasAssets(items) : null;
      items.push(...batch);
      if (batch.length < DAS_PAGE_SIZE) break; // short page = last page
    }
    return mapDasAssets(items);
  } catch {
    return null;
  }
}

/** Map raw DAS assets to Collectibles, dropping fungibles and burnt items. */
function mapDasAssets(items: DasAsset[]): Collectible[] {
  {
    const out: Collectible[] = [];
    for (const it of items) {
      if (!it?.id || it.burnt) continue;
      // Skip fungibles (they belong to the token list): anything with a divisible/multi balance.
      const ti = it.token_info;
      if (ti && ((ti.decimals ?? 0) > 0 || (ti.balance ?? 1) > 1)) continue;
      const iface = it.interface ?? "";
      if (/fungible/i.test(iface)) continue;

      const meta = it.content?.metadata;
      const attributes = (meta?.attributes ?? [])
        .filter((a) => a?.trait_type != null && a?.value != null)
        .map((a) => ({ trait: String(a.trait_type), value: String(a.value) }));
      const grouping = (it.grouping ?? []).find((g) => g.group_key === "collection");
      const image = it.content?.links?.image ?? it.content?.files?.[0]?.uri;
      const compressed = !!it.compression?.compressed;
      const programmable = /programmable/i.test(iface);
      const collectionVerified = grouping ? grouping.verified !== false : false;

      out.push({
        mint: it.id,
        name: meta?.name || meta?.symbol || `${it.id.slice(0, 4)}…${it.id.slice(-4)}`,
        image,
        description: meta?.description,
        collection: grouping?.group_value,
        collectionVerified,
        kind: parseKind(attributes),
        externalUrl: it.content?.links?.external_url,
        attributes: attributes.length ? attributes : undefined,
        compressed,
        transferable: !compressed && !programmable,
        likelySpam: !collectionVerified && !image,
      });
    }
    return out;
  }
}

/** Public-RPC fallback — NFT-shaped token accounts + the shared metadata resolver. */
async function fetchViaTokenAccounts(owner: string): Promise<Collectible[]> {
  const pk = new PublicKey(owner);
  const [legacy, t22] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  const mints: string[] = [];
  for (const a of [...legacy.value, ...t22.value]) {
    const info = a.account.data.parsed.info;
    if (info.tokenAmount.decimals === 0 && info.tokenAmount.uiAmount === 1) mints.push(info.mint as string);
  }
  if (!mints.length) return [];
  // Metadata lookups are the expensive part, so cap them — but still LIST every item (the
  // remainder just render with a short-mint name until a dedicated RPC fills them in).
  const metas = await fetchTokenMetas(mints.slice(0, 50)).catch(() => ({}) as Awaited<ReturnType<typeof fetchTokenMetas>>);
  return mints.map((mint) => {
    const m = metas[mint];
    return {
      mint,
      name: m?.name || m?.symbol || `${mint.slice(0, 4)}…${mint.slice(-4)}`,
      image: m?.logoURI,
      collectionVerified: false,
      kind: "art" as CollectibleKind,
      compressed: false,
      transferable: true,
      likelySpam: !m?.logoURI,
    };
  });
}

/**
 * Fetch the wallet's collection (last-good is available synchronously via `cachedCollectibles`).
 * Never throws; returns the last-good list on failure so the gallery doesn't blank.
 */
export async function fetchCollectibles(owner: string): Promise<Collectible[]> {
  try {
    const das = isPublicRpc() ? null : await fetchViaDas(owner);
    const items = das ?? (await fetchViaTokenAccounts(owner));
    saveSnapshot(owner, items);
    return items;
  } catch {
    return cachedCollectibles(owner) ?? [];
  }
}

/**
 * Resolve ONE item by mint — for the detail screen when the snapshot doesn't have it (a deep link,
 * a cleared cache, or an item received since the last refresh). DAS `getAsset`; null when unknown.
 */
export async function fetchCollectible(mint: string): Promise<Collectible | null> {
  if (isPublicRpc()) return null;
  try {
    const res = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "collectible", method: "getAsset", params: { id: mint } }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: DasAsset };
    if (!json.result?.id) return null;
    return mapDasAssets([json.result])[0] ?? null;
  } catch {
    return null;
  }
}
