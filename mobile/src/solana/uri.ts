/**
 * Content-URI normalization, shared by everything that resolves NFT/token media.
 *
 * NFT metadata points at content in several forms — `ipfs://<cid>`, a bare CID, a `/ipfs/<cid>`
 * URL on some gateway, `ar://<txid>`, or a plain https URL. Nothing but https loads in an image
 * component or a browser, so every one of those has to be mapped to a gateway first.
 *
 * This consolidates two partial implementations that had drifted apart: the private `toHttp` in
 * `tokens.ts` (handled IPFS well, passed Arweave through unchanged) and `candidates()` in
 * `TokenAvatar.tsx` (only matched a `/ipfs/<cid>` path, so a bare `ipfs://` URI never loaded).
 */

const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://nftstorage.link/ipfs/",
];
/** pump.fun pins its own content here — far more reliable on mobile than public ipfs.io. */
const PUMP_GATEWAY = "https://pump.mypinata.cloud/ipfs/";
const ARWEAVE_GATEWAY = "https://arweave.net/";

/** The IPFS CID in any of the forms metadata uses, or null when this isn't an IPFS reference. */
export function ipfsCid(uri: string): string | null {
  const u = uri.trim();
  return (
    u.match(/^ipfs:\/\/(.+)$/i)?.[1] ??
    u.match(/\/ipfs\/([A-Za-z0-9][^?#]*)/i)?.[1] ??
    (/^[A-Za-z0-9]{46,}$/.test(u) ? u : null)
  );
}

/**
 * Normalize any content URI to an https URL that a browser or image loader can actually fetch.
 * `mint` opts pump.fun tokens into pump's own gateway. Plain https passes through untouched.
 */
export function toHttp(uri: string, mint?: string): string {
  const u = uri.trim();
  const cid = ipfsCid(u);
  if (cid) return `${mint?.endsWith("pump") ? PUMP_GATEWAY : IPFS_GATEWAYS[0]}${cid}`;
  const ar = u.match(/^ar:\/\/(.+)$/i)?.[1];
  if (ar) return `${ARWEAVE_GATEWAY}${ar}`;
  return u;
}

/**
 * Whether a URL is safe to hand to a browser or the OS.
 *
 * NFT metadata is attacker-controlled — anyone can airdrop a token with any `external_url` — and
 * today that string goes straight into the app with no check at all. Only https gets through:
 * `javascript:`, `data:`, `file:`, `intent:` and friends are all rejected, and so is plain http.
 */
export function isSafeContentUrl(url: string): boolean {
  return /^https:\/\/[^\s]+$/i.test(url.trim());
}

/**
 * Every URL worth trying for one piece of content, best first — the normalized URL followed by the
 * remaining IPFS gateways. Image components walk this on load error so one slow or down gateway
 * doesn't mean a blank tile.
 */
export function candidates(uri?: string, mint?: string): string[] {
  if (!uri) return [];
  const first = toHttp(uri, mint);
  const cid = ipfsCid(uri);
  if (!cid) return [first];
  const rest = IPFS_GATEWAYS.map((g) => g + cid).filter((u) => u !== first);
  return [first, ...rest];
}
