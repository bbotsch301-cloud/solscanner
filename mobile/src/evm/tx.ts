/**
 * EIP-1559 (type-2) transaction building + signing, and ERC-20 calldata encoders.
 * Pure noble/RLP — no ethers. Verified by recovering the signer from the serialized
 * tx exactly as a node would (see the test-vector check run at build time).
 */
import { RLP } from "@ethereumjs/rlp";
import { keccak_256 } from "@noble/hashes/sha3";
import { secp256k1 } from "@noble/curves/secp256k1";

export function hexToBytes(hex: string): Uint8Array {
  let h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2) h = "0" + h;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** Minimal big-endian bytes for a non-negative integer; empty for 0 (RLP integer form). */
export function numToBytes(value: bigint): Uint8Array {
  if (value < 0n) throw new Error("Negative values are not encodable.");
  if (value === 0n) return new Uint8Array(0);
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return hexToBytes(hex);
}

export interface EvmTx {
  chainId: number;
  nonce: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  gasLimit: bigint;
  to: string; // 0x address
  value: bigint;
  data: string; // 0x… (may be "0x")
}

/** Sign an EIP-1559 transaction. Returns the 0x-prefixed raw tx ready to broadcast. */
export function signEip1559(tx: EvmTx, privateKey: Uint8Array): string {
  const base = [
    numToBytes(BigInt(tx.chainId)),
    numToBytes(tx.nonce),
    numToBytes(tx.maxPriorityFeePerGas),
    numToBytes(tx.maxFeePerGas),
    numToBytes(tx.gasLimit),
    hexToBytes(tx.to),
    numToBytes(tx.value),
    hexToBytes(tx.data || "0x"),
    [] as never[], // accessList
  ];
  const unsigned = new Uint8Array([0x02, ...RLP.encode(base)]);
  const hash = keccak_256(unsigned);
  const sig = secp256k1.sign(hash, privateKey); // canonical low-S by default
  const signed = [
    ...base,
    numToBytes(BigInt(sig.recovery)),
    numToBytes(sig.r),
    numToBytes(sig.s),
  ];
  return bytesToHex(new Uint8Array([0x02, ...RLP.encode(signed)]));
}

/** calldata for ERC-20 transfer(address,uint256). */
export function erc20TransferData(to: string, amount: bigint): string {
  const addr = to.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const amt = amount.toString(16).padStart(64, "0");
  return "0xa9059cbb" + addr + amt;
}

/** calldata for ERC-20 balanceOf(address). */
export function erc20BalanceOfData(owner: string): string {
  return "0x70a08231" + owner.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

const pad32 = (hexNo0x: string) => hexNo0x.padStart(64, "0");

/** calldata for ERC-20 approve(spender,uint256). */
export function erc20ApproveData(spender: string, amount: bigint): string {
  return (
    "0x095ea7b3" +
    pad32(spender.toLowerCase().replace(/^0x/, "")) +
    pad32(amount.toString(16))
  );
}

/** calldata for ERC-20 allowance(owner,spender). */
export function erc20AllowanceData(owner: string, spender: string): string {
  return (
    "0xdd62ed3e" +
    pad32(owner.toLowerCase().replace(/^0x/, "")) +
    pad32(spender.toLowerCase().replace(/^0x/, ""))
  );
}

/** Max uint256 — used for a one-time "infinite" ERC-20 approval. */
export const MAX_UINT256 = (1n << 256n) - 1n;
