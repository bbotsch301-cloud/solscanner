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
 * start in "Hidden". Separately, the user can "Archive" anything they're done with — see the prefs
 * section below for why those two are kept apart. Both persist on-device, as does the last-good
 * list per (cluster, address) so a cold open paints the gallery instantly.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toHttp } from "./uri";
import { connection, CLUSTER, isPublicRpc } from "./connection";
import { fetchTokenMetas } from "./tokens";
import { norm } from "../metadata/traits";

/**
 * What a member IS — standing, not stock.
 *
 * These are the classes the rails carry. **A community's own titles are not types here.** One
 * association's "Fellowship" is another's "Chapter" and another's nothing at all; hard-coding any of
 * them makes the rails one community's software. A title is metadata on a Community Key, named by
 * whoever issued it — see `LEGACY_KINDS` for what happened to the one that used to be a type.
 */
export type StandingKind =
  /** Gateway Membership — access to the Association itself. */
  | "membership"
  /** Delegated authority. Where authority comes from, instead of a username. */
  | "office"
  /** A certification or qualification. */
  | "credential"
  /** Belonging to a community within the Association — including its own name for that belonging. */
  | "community";

/** What a member OWNS or can use. The Property Templates set. */
export type TemplateKind =
  | "book"
  | "course"
  | "software"
  | "music"
  /** An AI agent or companion the member owns. */
  | "ai"
  /** Time-limited access that lapses. */
  | "subscription"
  | "ticket"
  | "portal"
  | "file"
  | "art";

/**
 * The two together. `parseKind` reads whichever the issuer wrote into the metadata.
 *
 * Split into two named types rather than one flat union because the standing/holdings distinction is
 * load-bearing in four separate places — standing confers membership, holdings fill the Vault — and
 * it used to be re-typed by hand at each of them, with a comment in one admitting it was hand-synced
 * with another. Now `STANDING_VALUES` below is the single copy and everything derives from it.
 */
export type CollectibleKind = StandingKind | TemplateKind;

export interface Collectible {
  mint: string;
  name: string;
  image?: string;
  description?: string;
  collection?: string;
  collectionVerified: boolean;
  kind: CollectibleKind;
  externalUrl?: string;
  /**
   * Every file the asset carries, not just the artwork — this is what a pass actually grants
   * access to (a PDF, an ePub, a video). `mime` comes from DAS where the indexer populated it,
   * else it's sniffed from the extension; either can be missing.
   */
  files?: { uri: string; mime?: string }[];
  /** Interactive/animated content (video, 3D, HTML) — DAS `content.links.animation_url`. */
  animationUrl?: string;
  attributes?: { trait: string; value: string }[];
  compressed: boolean;
  /** Plain SPL transfer works (standard, non-compressed, non-programmable). */
  transferable: boolean;
  /** Started in Hidden by the spam heuristic (unverified collection + no artwork). */
  likelySpam: boolean;
}

const HIDDEN_KEY = "collectibles.hidden.v1";
const ARCHIVED_KEY = "collectibles.archived.v1";
// v2: `fellowship` stopped being a kind. Snapshots store items verbatim for a week and are read back
// with no runtime guard, so a v1 entry would resurrect a string the type no longer admits — and the
// cold-open surfaces read straight from this cache. Bumping the key retires those entries instead.
const SNAP_KEY = "collectibles.snap.v2:";
const SNAP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The kinds that say what a member IS. **The only copy.**
 *
 * `identity/membership.ts` and `components/PropertyGallery.tsx` both derive their sets from this
 * rather than restating it, which is what they used to do — three hand-maintained copies of the same
 * four names, in three shapes, in three modules.
 */
export const STANDING_VALUES = ["membership", "office", "credential", "community"] as const;

const TEMPLATE_VALUES = [
  "book",
  "course",
  "software",
  "music",
  "ai",
  "subscription",
  "ticket",
  "portal",
  "file",
  "art",
] as const;

// A value missing from the arrays above is unparseable forever — `parseKind` would quietly answer
// "art" for it, and nothing would fail. These two lines make that a compile error instead: adding a
// kind to either union without listing it here stops the build.
type _StandingListed = Exclude<StandingKind, (typeof STANDING_VALUES)[number]>;
type _TemplateListed = Exclude<TemplateKind, (typeof TEMPLATE_VALUES)[number]>;
const _kindsAreListed: [_StandingListed, _TemplateListed] extends [never, never] ? true : never = true;
void _kindsAreListed;

const KIND_VALUES = new Set<string>([...STANDING_VALUES, ...TEMPLATE_VALUES]);

/**
 * Whether a kind says what a member IS rather than what they own.
 *
 * A type guard rather than a bare `includes`, so a caller that has filtered on it can then switch
 * over `StandingKind` exhaustively — which is how `deriveStanding` gets a real `assertNever` instead
 * of a `default` branch it had to describe as "listed here for readability".
 */
export function isStandingKind(kind: CollectibleKind): kind is StandingKind {
  return (STANDING_VALUES as readonly string[]).includes(kind);
}

/**
 * Kinds that were types once and are metadata now. Permanent — assets are already minted with them.
 *
 * `fellowship` was "ecclesiastical participation", which is one association's word for belonging.
 * The rails carry Community; what a community calls its members is theirs to name. An existing
 * Fellowship key keeps working and keeps the name its own metadata gives it, rather than degrading
 * into generic art the way an unrecognised value otherwise would.
 */
const LEGACY_KINDS: Record<string, CollectibleKind> = {
  fellowship: "community",
};

// ---- Per-item prefs (user-controlled, persisted; load-once + write-through like pubAddresses).
//
// Two DIFFERENT ideas, deliberately kept apart:
//   • HIDDEN — junk. Spam-looking airdrops start here automatically; the user can force-hide
//     something or rescue a false positive, but this bucket means "not really mine".
//   • ARCHIVED — a deliberate "I'm done with this". A ticket to an event that's happened, a pass
//     that's been used. It's still yours, still openable and sendable, just out of the way.
//
// Folding these together would file a used ticket in the same drawer as a scam airdrop. ----

let hiddenOverrides = new Map<string, boolean>();
let archivedSet = new Set<string>();
const prefsListeners = new Set<() => void>();

function notifyPrefs(): void {
  prefsListeners.forEach((fn) => fn());
}

export async function loadCollectiblePrefs(): Promise<void> {
  try {
    const [rawHidden, rawArchived] = await Promise.all([
      AsyncStorage.getItem(HIDDEN_KEY),
      AsyncStorage.getItem(ARCHIVED_KEY),
    ]);
    if (rawHidden) hiddenOverrides = new Map(Object.entries(JSON.parse(rawHidden) as Record<string, boolean>));
    if (rawArchived) archivedSet = new Set(JSON.parse(rawArchived) as string[]);
  } catch {
    /* best-effort */
  }
}

/** Junk: the spam heuristic, unless the user has said otherwise either way. */
export function isHiddenItem(c: Collectible): boolean {
  return hiddenOverrides.get(c.mint) ?? c.likelySpam;
}

export function setHidden(mint: string, v: boolean): void {
  hiddenOverrides.set(mint, v);
  AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(Object.fromEntries(hiddenOverrides))).catch(() => {});
  notifyPrefs();
}

/** Done with, but still yours. Never automatic — only ever the user's own choice. */
export function isArchived(mint: string): boolean {
  return archivedSet.has(mint);
}

export function setArchived(mint: string, v: boolean): void {
  if (v) archivedSet.add(mint);
  else archivedSet.delete(mint);
  AsyncStorage.setItem(ARCHIVED_KEY, JSON.stringify([...archivedSet])).catch(() => {});
  notifyPrefs();
}

/** Subscribe to hide/archive changes so an open gallery re-splits its sections. Returns unsubscribe. */
export function onPrefsChange(fn: () => void): () => void {
  prefsListeners.add(fn);
  return () => {
    prefsListeners.delete(fn);
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

/**
 * Every address this device has a snapshot for on the current cluster.
 *
 * Startup housekeeping needs to know which owners exist without asking the wallet to unlock — the
 * copies of one account must not be cleaned up as orphans just because a different account happens
 * to be active. Derived from the snapshot keys rather than from the vault, which is locked at the
 * point this runs.
 */
export function knownOwners(): string[] {
  const prefix = `sol:${CLUSTER}:`;
  return [...warmSnap.keys()].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length));
}

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
  // Anything the app stored because this key justified it goes with the key. Hooked HERE rather
  // than at the call sites: there are already two of those and a third will be added, and the one
  // that forgets is the one that leaks a file forever.
  holdingLost?.(owner, mint);
  itemsListeners.forEach((fn) => fn());
}

/**
 * Told when a key leaves this wallet.
 *
 * A registration hook rather than a direct import, because the thing that cares
 * (`property/keyCopy/sweep.ts`) already reads deeds, which read Collectibles — importing it here
 * would close that loop. Registered once at startup.
 */
let holdingLost: ((owner: string, mint: string) => void) | null = null;

export function onHoldingLost(fn: (owner: string, mint: string) => void): void {
  holdingLost = fn;
}

// ---- Fetching ----

/**
 * The kind the issuer stated, or `art` when they stated nothing we recognise.
 *
 * Trait name and value both go through `norm`, so "Asset Type", "asset_type" and "Type " all match,
 * and a value of "Book " or "E-Book" lands on `book` instead of silently becoming art. This used to
 * be an exact-equality check, while the deed parser next door — whose comment says it follows "the
 * same tolerant spirit as parseKind" — was doing the tolerant thing all along.
 */
export function parseKind(attrs: { trait: string; value: string }[] | undefined): CollectibleKind {
  const raw = attrs?.find((a) => ["type", "kind", "assettype", "keytype"].includes(norm(a.trait)))?.value;
  if (!raw) return "art";
  const v = norm(raw);
  if (KIND_VALUES.has(v)) return v as CollectibleKind;
  return LEGACY_KINDS[v] ?? "art";
}

/** Extension → mime, for the common case where the DAS indexer left `mime` empty. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  epub: "application/epub+zip",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  html: "text/html",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
};

function mimeFromUrl(url: string): string | undefined {
  const ext = url.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
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
    links?: { image?: string; external_url?: string; animation_url?: string };
    files?: { uri?: string; cdn_uri?: string; mime?: string }[];
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
      const files = (it.content?.files ?? [])
        .map((f) => {
          const uri = f.cdn_uri || f.uri;
          return uri ? { uri: toHttp(uri), mime: f.mime || mimeFromUrl(uri) } : null;
        })
        .filter((f): f is { uri: string; mime: string | undefined } => !!f);
      // Prefer the first file that's actually an image over a blind files[0] — on an asset whose
      // payload is a PDF or video, files[0] is the payload, not the cover art.
      const image =
        it.content?.links?.image ?? files.find((f) => f.mime?.startsWith("image/"))?.uri ?? files[0]?.uri;
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
        files: files.length ? files : undefined,
        animationUrl: it.content?.links?.animation_url,
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
  return (await fetchHoldings(owner)).items;
}

/**
 * The same fetch, but saying whether the chain actually answered.
 *
 * `fetchCollectibles` returns the cached list when the network fails, which is right for a gallery —
 * a blank screen is worse than a stale one. It is catastrophic for anything that *acts* on absence:
 * "the chain says you no longer hold this" and "we couldn't reach the chain" become the same value,
 * so one bad minute of connectivity looks exactly like a wallet that was emptied.
 *
 * Anything deciding to delete on the strength of an item being missing must use this and check `ok`.
 * See `property/keyCopy/sweep.ts`, which is the reason it exists.
 */
export type Holdings = { ok: true; items: Collectible[] } | { ok: false; items: Collectible[] };

export async function fetchHoldings(owner: string): Promise<Holdings> {
  try {
    const das = isPublicRpc() ? null : await fetchViaDas(owner);
    const items = das ?? (await fetchViaTokenAccounts(owner));
    saveSnapshot(owner, items);
    return { ok: true, items };
  } catch {
    return { ok: false, items: cachedCollectibles(owner) ?? [] };
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
