/**
 * Dispatch a WalletConnect session_request to the right signer. EVM signing is proven
 * against spec vectors (evm/message + evm/eip712 + evm/tx). Solana signing reuses the
 * Keypair + noble ed25519 + web3.js. Every path here runs only AFTER the user approves
 * the request in the UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import bs58 from "bs58";
import { ed25519 } from "@noble/curves/ed25519";
import { Keypair, VersionedTransaction, Transaction, type Connection } from "@solana/web3.js";
import { CHAINS } from "../chains/registry";
import type { EvmAccount } from "../wallet/evm";
import { personalSign } from "../evm/message";
import { signTypedData, type TypedData } from "../evm/eip712";
import { signEip1559, type EvmTx } from "../evm/tx";
import { estimateGas, getFees, getNonce, sendRawTransaction } from "../evm/rpc";

const hexToBig = (h?: string): bigint => (h && h !== "0x" ? BigInt(h) : 0n);

function evmChainOf(chainId: string) {
  const id = Number(chainId.split(":")[1]);
  return CHAINS.find((c) => c.evmChainId === id) ?? null;
}

/** Short human summary of a request for the approval screen. */
export function describeRequest(method: string, params: any): string {
  switch (method) {
    case "personal_sign":
      return decodeMaybeHex(params?.[0]);
    case "eth_sign":
      return decodeMaybeHex(params?.[1]);
    case "eth_signTypedData":
    case "eth_signTypedData_v4":
      return "Sign typed data (EIP-712)";
    case "eth_sendTransaction":
    case "eth_signTransaction":
      return `Send transaction to ${short(params?.[0]?.to)}`;
    case "solana_signMessage":
      return "Sign a Solana message";
    case "solana_signTransaction":
    case "solana_signAndSendTransaction":
      return "Sign a Solana transaction";
    default:
      return method;
  }
}

function decodeMaybeHex(s?: string): string {
  if (!s) return "";
  if (s.startsWith("0x")) {
    try {
      const bytes = s.slice(2).match(/../g)!.map((b) => parseInt(b, 16));
      return new TextDecoder().decode(Uint8Array.from(bytes));
    } catch {
      return s;
    }
  }
  return s;
}
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "?");

export async function handleEvmRequest(
  method: string,
  params: any,
  chainId: string,
  acct: EvmAccount
): Promise<string> {
  switch (method) {
    case "personal_sign":
      return personalSign(params[0], acct.privateKey);
    case "eth_sign":
      return personalSign(params[1], acct.privateKey);
    case "eth_signTypedData":
    case "eth_signTypedData_v4": {
      const data = params[1];
      const td = (typeof data === "string" ? JSON.parse(data) : data) as TypedData;
      return signTypedData(td, acct.privateKey);
    }
    case "eth_sendTransaction":
    case "eth_signTransaction": {
      const tx = params[0];
      const chain = evmChainOf(chainId);
      if (!chain?.evmChainId) throw new Error("Unsupported EVM chain.");
      const [nonce, fees] = await Promise.all([getNonce(chain, acct.address), getFees(chain)]);
      let gas = hexToBig(tx.gas ?? tx.gasLimit);
      if (gas === 0n) {
        try {
          gas = ((await estimateGas(chain, { from: acct.address, to: tx.to, value: tx.value, data: tx.data })) * 12n) / 10n;
        } catch {
          gas = 250_000n;
        }
      }
      const evmTx: EvmTx = {
        chainId: chain.evmChainId,
        nonce,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        maxFeePerGas: fees.maxFeePerGas,
        gasLimit: gas,
        to: tx.to,
        value: hexToBig(tx.value),
        data: tx.data || "0x",
      };
      const raw = signEip1559(evmTx, acct.privateKey);
      return method === "eth_signTransaction" ? raw : sendRawTransaction(chain, raw);
    }
    default:
      throw new Error(`Unsupported EVM method: ${method}`);
  }
}

export async function handleSolanaRequest(
  method: string,
  params: any,
  keypair: Keypair,
  connection: Connection
): Promise<any> {
  switch (method) {
    case "solana_signMessage": {
      const msg = bs58.decode(params.message);
      const sig = ed25519.sign(msg, keypair.secretKey.slice(0, 32));
      return { signature: bs58.encode(sig) };
    }
    case "solana_signTransaction":
    case "solana_signAndSendTransaction": {
      const bytes = Uint8Array.from(Buffer.from(params.transaction, "base64"));
      let tx: VersionedTransaction | Transaction;
      try {
        tx = VersionedTransaction.deserialize(bytes);
        (tx as VersionedTransaction).sign([keypair]);
      } catch {
        tx = Transaction.from(bytes);
        (tx as Transaction).partialSign(keypair);
      }
      if (method === "solana_signAndSendTransaction") {
        const sig = await connection.sendRawTransaction(tx.serialize());
        return { signature: sig };
      }
      const sig = (tx as VersionedTransaction).signatures?.[0] ?? new Uint8Array();
      return { signature: bs58.encode(sig as Uint8Array), transaction: Buffer.from(tx.serialize()).toString("base64") };
    }
    default:
      throw new Error(`Unsupported Solana method: ${method}`);
  }
}
