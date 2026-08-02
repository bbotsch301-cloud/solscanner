/**
 * RN-side execution of a bridged dApp request from the browser. EVM reuses the exact WalletConnect
 * signer (`handleEvmRequest`); Solana is done here directly because the browser bridge speaks base64
 * (the page can't depend on bs58), returning the signer's raw signature bytes so the page can apply
 * them to its own transaction object. Runs only AFTER the user approves in the sheet.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { Keypair, VersionedTransaction, Transaction } from "@solana/web3.js";
import { connection } from "../solana/connection";
import { CHAINS } from "../chains/registry";
import { handleEvmRequest, describeRequest, type RequestSummary } from "../walletconnect/handlers";
import { activeEvmAccount } from "../wallet/vault";

const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(Buffer.from(b64, "base64"));
const bytesToB64 = (b: Uint8Array): string => Buffer.from(b).toString("base64");

/** CAIP-2 chain id string (e.g. "eip155:1") for the given hex EVM chain id. */
export function caip2ForEvmHex(hex: string): string {
  return `eip155:${parseInt(hex, 16)}`;
}

/** Human-readable summary for the approval sheet — reuses the WalletConnect decoder. For Solana the
 *  bridge speaks base64; describeRequest's Solana branch also reads base64, so it composes directly. */
export function summarizeDappRequest(kind: "evm" | "solana", method: string, params: unknown, chainIdHex: string): RequestSummary {
  const caip2 = kind === "evm" ? caip2ForEvmHex(chainIdHex) : "solana:mainnet";
  return describeRequest(method, params as never, caip2);
}

/** Run an approved EVM request. Returns the string result (signature or tx hash). */
export async function runEvmRequest(method: string, params: unknown[], chainIdHex: string): Promise<string> {
  const acct = await activeEvmAccount();
  if (!acct) throw new Error("No EVM account on this device.");
  return handleEvmRequest(method, params, caip2ForEvmHex(chainIdHex), acct);
}

/** For wallet_switchEthereumChain: map the requested hex chain id to one we support. */
export function evmChainForHex(hex: string) {
  const id = Number(BigInt(hex));
  return CHAINS.find((c) => c.evmChainId === id) ?? null;
}

/** Proxy a read-only EVM JSON-RPC call (eth_call, eth_getBalance, eth_estimateGas, …) to the active
 *  chain's RPC. Requires no approval — it moves no funds and exposes nothing the page couldn't fetch
 *  itself; it just spares the dApp from configuring its own RPC. */
export async function evmRpcPassthrough(method: string, params: unknown, chainIdHex: string): Promise<unknown> {
  const chain = evmChainForHex(chainIdHex) ?? CHAINS.find((c) => c.evmChainId === 1);
  if (!chain?.rpc) throw new Error("No RPC for this chain.");
  const res = await fetch(chain.rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }),
  });
  const j = (await res.json()) as { result?: unknown; error?: { message?: string } };
  if (j.error) throw new Error(j.error.message ?? "RPC error");
  return j.result ?? null;
}

function signerSignature(tx: VersionedTransaction | Transaction, kp: Keypair): Uint8Array {
  if (tx instanceof VersionedTransaction) {
    const idx = tx.message.staticAccountKeys.findIndex((k) => k.equals(kp.publicKey));
    return idx >= 0 ? tx.signatures[idx] : new Uint8Array();
  }
  const s = tx.signatures.find((x) => x.publicKey.equals(kp.publicKey));
  return s?.signature ? Uint8Array.from(s.signature) : new Uint8Array();
}

function deserialize(b64: string): VersionedTransaction | Transaction {
  const bytes = b64ToBytes(b64);
  try {
    return VersionedTransaction.deserialize(bytes);
  } catch {
    return Transaction.from(bytes);
  }
}

/** Serialize a (partially) signed tx to base64 — needed by the wallet-standard signTransaction,
 *  which returns the whole signed transaction rather than just the signature. */
function serializeSigned(tx: VersionedTransaction | Transaction): string {
  const bytes = tx instanceof VersionedTransaction ? tx.serialize() : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  return bytesToB64(bytes);
}

/** Run an approved Solana request. Signatures are returned base64 for the page to apply. */
export async function runSolanaRequest(method: string, params: Record<string, unknown>, kp: Keypair): Promise<unknown> {
  switch (method) {
    case "solana_signMessage": {
      const msg = b64ToBytes(String(params.message));
      const sig = ed25519.sign(msg, kp.secretKey.slice(0, 32));
      return { signature: bytesToB64(sig) };
    }
    case "solana_signTransaction": {
      const tx = deserialize(String(params.transaction));
      if (tx instanceof VersionedTransaction) tx.sign([kp]);
      else tx.partialSign(kp);
      // `signature` = our raw sig (for the Phantom window.solana path, which applies it to the page's
      // own tx object); `transaction` = full signed bytes (for the wallet-standard path).
      return { signature: bytesToB64(signerSignature(tx, kp)), transaction: serializeSigned(tx) };
    }
    case "solana_signAndSendTransaction": {
      const tx = deserialize(String(params.transaction));
      if (tx instanceof VersionedTransaction) tx.sign([kp]);
      else tx.partialSign(kp);
      const sig = await connection.sendRawTransaction(tx.serialize());
      // `signature` = base58 txid (Phantom); `signatureBytes` = raw 64-byte sig (wallet-standard).
      return { signature: sig, signatureBytes: bytesToB64(signerSignature(tx, kp)) };
    }
    case "solana_signAllTransactions": {
      const list = (params.transactions as string[]) ?? [];
      const out = list.map((b64) => {
        const tx = deserialize(b64);
        if (tx instanceof VersionedTransaction) tx.sign([kp]);
        else tx.partialSign(kp);
        return { signature: bytesToB64(signerSignature(tx, kp)), transaction: serializeSigned(tx) };
      });
      return { signatures: out.map((o) => o.signature), transactions: out.map((o) => o.transaction) };
    }
    default:
      throw new Error(`Unsupported Solana method: ${method}`);
  }
}
