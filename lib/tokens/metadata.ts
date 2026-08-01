/**
 * Best-effort token metadata fallbacks — name, symbol, and logo for tokens that
 * DexScreener doesn't resolve (fresh pump.fun tokens, unlisted pairs, …).
 *
 * Solana order: Jupiter token API → on-chain Metaplex metadata (the authoritative
 * fallback: read the metadata account, then its off-chain JSON `image`). Every hop is
 * best-effort and cached with ISR; failures return partial/empty and callers degrade.
 */
import { Connection, PublicKey } from "@solana/web3.js";

export interface TokenMeta {
  name?: string;
  symbol?: string;
  logo?: string;
}

const REVALIDATE = 3600; // token metadata rarely changes

/** Mainnet RPC, matching the server pattern in lib/liquidity/raydium.server.ts. */
function rpcUrl(): string {
  return (
    process.env.MAINNET_RPC ??
    process.env.NEXT_PUBLIC_MAINNET_RPC ??
    "https://api.mainnet-beta.solana.com"
  );
}

const TOKEN_METADATA_PROGRAM = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** ipfs:// and bare-CID URIs → an HTTPS gateway; https/http pass through. */
function toHttp(uri: string): string {
  const u = uri.trim();
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice("ipfs://".length)}`;
  if (/^[A-Za-z0-9]{46,}$/.test(u)) return `https://ipfs.io/ipfs/${u}`; // bare CID
  return u;
}

// ---- Jupiter -----------------------------------------------------------------

async function fromJupiter(mint: string): Promise<TokenMeta | null> {
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${mint}`, {
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { name?: string; symbol?: string; logoURI?: string } | null;
    if (!j || (!j.symbol && !j.name && !j.logoURI)) return null;
    return { name: j.name, symbol: j.symbol, logo: j.logoURI };
  } catch {
    return null;
  }
}

// ---- on-chain Metaplex metadata ----------------------------------------------

/** Read a borsh String (u32-LE length + bytes) at `offset`; NUL-trimmed. */
function readBorshString(buf: Buffer, offset: number): { value: string; next: number } {
  const len = buf.readUInt32LE(offset);
  const start = offset + 4;
  const raw = buf.subarray(start, start + len).toString("utf8");
  return { value: raw.replace(/\0/g, "").trim(), next: start + len };
}

async function fromOnChain(mint: string): Promise<TokenMeta | null> {
  try {
    const mintKey = new PublicKey(mint);
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("metadata"), TOKEN_METADATA_PROGRAM.toBuffer(), mintKey.toBuffer()],
      TOKEN_METADATA_PROGRAM
    );
    const info = await new Connection(rpcUrl(), "confirmed").getAccountInfo(pda);
    if (!info?.data) return null;
    const data = info.data as Buffer;

    // key(1) + updateAuthority(32) + mint(32) → name starts at 65.
    const offset = 1 + 32 + 32;
    const name = readBorshString(data, offset);
    const symbol = readBorshString(data, name.next);
    const uri = readBorshString(data, symbol.next);

    let logo: string | undefined;
    if (uri.value) {
      try {
        const res = await fetch(toHttp(uri.value), { next: { revalidate: REVALIDATE } });
        if (res.ok) {
          const j = (await res.json()) as { image?: string } | null;
          if (j?.image) logo = toHttp(j.image);
        }
      } catch {
        /* off-chain JSON unreachable — keep name/symbol */
      }
    }
    return { name: name.value || undefined, symbol: symbol.value || undefined, logo };
  } catch {
    return null;
  }
}

/**
 * Resolve missing name/symbol/logo for one token. `have` is whatever DexScreener already
 * gave us; we only reach for fallbacks to fill the gaps. EVM has no keyless fallback
 * beyond DexScreener, so it returns `have` unchanged (use a showcase override for gaps).
 */
export async function resolveMeta(
  address: string,
  chain: "solana" | "evm",
  have: TokenMeta = {}
): Promise<TokenMeta> {
  if (have.name && have.symbol && have.logo) return have;
  if (chain !== "solana") return have;

  const merged: TokenMeta = { ...have };
  const jup = await fromJupiter(address);
  if (jup) {
    merged.name ??= jup.name;
    merged.symbol ??= jup.symbol;
    merged.logo ??= jup.logo;
  }
  if (!merged.symbol || !merged.logo || !merged.name) {
    const chainMeta = await fromOnChain(address);
    if (chainMeta) {
      merged.name ??= chainMeta.name;
      merged.symbol ??= chainMeta.symbol;
      merged.logo ??= chainMeta.logo;
    }
  }
  return merged;
}
