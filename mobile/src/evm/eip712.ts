/**
 * EIP-712 typed structured data hashing for eth_signTypedData_v4. Implements
 * encodeType / typeHash / encodeData / hashStruct / domainSeparator and the final
 * 0x1901 digest. Pure noble keccak; verified against the EIP-712 spec's Mail vector.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { hexToBytes } from "./tx";
import { signDigest } from "./message";

export interface TypedField {
  name: string;
  type: string;
}
export interface TypedData {
  types: Record<string, TypedField[]>;
  primaryType: string;
  domain: Record<string, unknown>;
  message: Record<string, unknown>;
}

const enc = (s: string) => new TextEncoder().encode(s);
const baseType = (t: string) => t.replace(/(\[\d*\])+$/, "");
const isArray = (t: string) => /\[\d*\]$/.test(t);

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Left-pad (numbers/addresses) to 32 bytes. */
function padLeft32(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(32);
  out.set(bytes.slice(-32), 32 - Math.min(bytes.length, 32));
  return out;
}

function encodeType(primary: string, types: Record<string, TypedField[]>): string {
  const deps = new Set<string>();
  const find = (t: string) => {
    if (deps.has(t) || !types[t]) return;
    deps.add(t);
    for (const f of types[t]) find(baseType(f.type));
  };
  find(primary);
  deps.delete(primary);
  const ordered = [primary, ...[...deps].sort()];
  return ordered.map((t) => `${t}(${types[t].map((f) => `${f.type} ${f.name}`).join(",")})`).join("");
}

function typeHash(primary: string, types: Record<string, TypedField[]>): Uint8Array {
  return keccak_256(enc(encodeType(primary, types)));
}

function encodeField(type: string, value: unknown, types: Record<string, TypedField[]>): Uint8Array {
  if (types[type]) return keccak_256(encodeData(type, value as Record<string, unknown>, types));
  if (isArray(type)) {
    const inner = type.slice(0, type.lastIndexOf("["));
    const arr = (value as unknown[]).map((v) => encodeField(inner, v, types));
    return keccak_256(concat(arr));
  }
  if (type === "string") return keccak_256(enc(String(value)));
  if (type === "bytes") return keccak_256(hexToBytes(String(value)));
  if (type === "bool") return padLeft32(new Uint8Array([value ? 1 : 0]));
  if (type === "address") return padLeft32(hexToBytes(String(value)));
  if (type.startsWith("bytes")) {
    // fixed bytesN — right-padded
    const out = new Uint8Array(32);
    out.set(hexToBytes(String(value)).slice(0, 32), 0);
    return out;
  }
  // uint*/int* — big-endian, left-padded (two's complement for negatives)
  let v = BigInt(value as string | number);
  if (v < 0n) v = (1n << 256n) + v;
  let hex = v.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return padLeft32(hexToBytes("0x" + hex));
}

function encodeData(primary: string, data: Record<string, unknown>, types: Record<string, TypedField[]>): Uint8Array {
  const parts: Uint8Array[] = [typeHash(primary, types)];
  for (const f of types[primary]) parts.push(encodeField(f.type, data[f.name], types));
  return concat(parts);
}

function hashStruct(primary: string, data: Record<string, unknown>, types: Record<string, TypedField[]>): Uint8Array {
  return keccak_256(encodeData(primary, data, types));
}

/** keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(primaryType, message)). */
export function hashTypedData(td: TypedData): Uint8Array {
  const domainSep = hashStruct("EIP712Domain", td.domain, td.types);
  const structHash = hashStruct(td.primaryType, td.message, td.types);
  return keccak_256(concat([new Uint8Array([0x19, 0x01]), domainSep, structHash]));
}

/** Sign typed data (v4), returning the 65-byte signature. */
export function signTypedData(td: TypedData, privateKey: Uint8Array): string {
  return signDigest(hashTypedData(td), privateKey);
}
