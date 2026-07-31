/**
 * Human-readable name → address resolution for the Send screen.
 * - `*.eth` → ENS on Ethereum mainnet, resolved via eth_call (keyless).
 * - `*.sol` → Bonfida SNS public resolver (keyless).
 * Everything is best-effort and fails soft to null.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { getChain } from "../chains/registry";
import { ethCall } from "../evm/rpc";
import { isEvmAddress, toChecksumAddress, toHex } from "../wallet/evm";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

/** EIP-137 namehash. */
export function namehash(name: string): string {
  let node: Uint8Array<ArrayBufferLike> = new Uint8Array(32); // 32 zero bytes
  if (name) {
    for (const label of name.toLowerCase().split(".").reverse()) {
      const labelHash = keccak_256(new TextEncoder().encode(label));
      node = keccak_256(new Uint8Array([...node, ...labelHash]));
    }
  }
  return "0x" + toHex(node);
}

const addressFromWord = (hex: string): string | null => {
  const raw = hex.replace(/^0x/, "");
  if (raw.length < 64) return null;
  const addr = "0x" + raw.slice(24, 64); // last 20 bytes of the 32-byte word
  if (/^0x0{40}$/.test(addr)) return null;
  return toChecksumAddress(addr);
};

async function resolveEns(name: string): Promise<string | null> {
  const eth = getChain("ethereum");
  const node = namehash(name).replace(/^0x/, "");
  try {
    // registry.resolver(node) → resolver address
    const resolverHex = await ethCall(eth, ENS_REGISTRY, "0x0178b8bf" + node);
    const resolver = addressFromWord(resolverHex);
    if (!resolver) return null;
    // resolver.addr(node) → address
    const addrHex = await ethCall(eth, resolver, "0x3b3b57de" + node);
    return addressFromWord(addrHex);
  } catch {
    return null;
  }
}

async function resolveSns(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://sns-sdk-proxy.bonfida.workers.dev/resolve/${domain}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { result?: string; s?: string };
    const addr = j.result ?? j.s;
    return addr && addr.length >= 32 ? addr : null;
  } catch {
    return null;
  }
}

export function looksLikeName(input: string): "eth" | "sol" | null {
  const s = input.trim().toLowerCase();
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(s)) return "eth";
  if (/^[a-z0-9-]+\.sol$/.test(s)) return "sol";
  return null;
}

/** Resolve a name to an address, or null. Bare addresses return themselves if valid. */
export async function resolveName(input: string): Promise<string | null> {
  const s = input.trim();
  const kind = looksLikeName(s);
  if (kind === "eth") return resolveEns(s);
  if (kind === "sol") return resolveSns(s.toLowerCase());
  if (isEvmAddress(s)) return toChecksumAddress(s);
  return null;
}
