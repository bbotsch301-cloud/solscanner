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
import { estimateGas, getFees, sendRawTransaction } from "../evm/rpc";
import { reserveNonce } from "../evm/nonce";
import { recordApproval } from "../safety/approvals";
import { summarizeEvmData, summarizeSolanaTx } from "./decode";

const hexToBig = (h?: string): bigint => (h && h !== "0x" ? BigInt(h) : 0n);

function evmChainOf(chainId: string) {
  const id = Number(chainId.split(":")[1]);
  return CHAINS.find((c) => c.evmChainId === id) ?? null;
}

export interface RequestSummary {
  title: string;
  lines: { label: string; value: string }[];
  /** Strong red warning when the action can move funds / grant approvals. */
  danger: string | null;
}

function decodeText(s?: string): string {
  if (!s) return "";
  if (s.startsWith("0x")) {
    try {
      const bytes = s.slice(2).match(/../g)!.map((b) => parseInt(b, 16));
      const txt = new TextDecoder().decode(Uint8Array.from(bytes));
      // Show the decoded text only if it's readable UTF-8 (no control chars
      // other than tab/newline/CR); otherwise show the raw hex.
      const hasControl = [...txt].some((c) => {
        const code = c.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      });
      return hasControl ? s : txt;
    } catch {
      return s;
    }
  }
  return s;
}

function fmtWei(hex?: string): string {
  try {
    const w = hex && hex !== "0x" ? BigInt(hex) : 0n;
    return (Number(w) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 8 });
  } catch {
    return "0";
  }
}

/** Decode a request into a human-readable summary for the approval screen. */
export function describeRequest(method: string, params: any, chainId?: string): RequestSummary {
  const sym = String(chainId).startsWith("eip155:56")
    ? "BNB"
    : String(chainId).startsWith("eip155:")
      ? "ETH"
      : "";
  switch (method) {
    case "personal_sign":
      return { title: "Message signature", lines: [{ label: "Message", value: decodeText(params?.[0]) || "(empty)" }], danger: null };
    case "eth_sign":
      return {
        title: "Raw signature",
        lines: [{ label: "Data", value: decodeText(params?.[1]) || String(params?.[1]) }],
        danger: "eth_sign signs raw data and is frequently used in scams. Approve only if you completely trust this app.",
      };
    case "eth_signTypedData":
    case "eth_signTypedData_v4": {
      let td: any = params?.[1];
      try {
        if (typeof td === "string") td = JSON.parse(td);
      } catch {
        /* leave as-is */
      }
      const msg = td?.message ?? {};
      const lines = [
        { label: "App domain", value: td?.domain?.name ?? "unknown" },
        { label: "Type", value: td?.primaryType ?? "unknown" },
      ];
      for (const k of Object.keys(msg).slice(0, 5)) {
        lines.push({ label: k, value: typeof msg[k] === "object" ? JSON.stringify(msg[k]) : String(msg[k]) });
      }
      const permitish = /permit|approv|allowance/i.test(td?.primaryType ?? "") || "spender" in msg || "allowed" in msg;
      return {
        title: "Typed-data signature",
        lines,
        danger: permitish
          ? "This can authorize an app to move your tokens without another confirmation. Approve only if you trust it."
          : null,
      };
    }
    case "eth_sendTransaction":
    case "eth_signTransaction": {
      const tx = params?.[0] ?? {};
      const lines = [
        { label: "To", value: tx.to ?? "?" },
        { label: "Amount", value: `${fmtWei(tx.value)} ${sym}`.trim() },
      ];
      const decoded = summarizeEvmData(tx.data);
      if (decoded) lines.push(decoded.line);
      return {
        title: method === "eth_sendTransaction" ? "Send transaction" : "Sign transaction",
        lines,
        danger: decoded?.danger ?? "This will send funds from your wallet.",
      };
    }
    case "solana_signMessage":
      return { title: "Solana message signature", lines: [{ label: "Message", value: String(params?.message ?? "").slice(0, 120) }], danger: null };
    case "solana_signTransaction":
    case "solana_signAndSendTransaction": {
      const s = summarizeSolanaTx(String(params?.transaction ?? ""));
      return {
        title: method === "solana_signAndSendTransaction" ? "Send Solana transaction" : "Sign Solana transaction",
        lines: s.lines,
        danger: s.danger,
      };
    }
    default:
      return { title: method, lines: [], danger: null };
  }
}

export async function handleEvmRequest(
  method: string,
  params: any,
  chainId: string,
  acct: EvmAccount
): Promise<string> {
  switch (method) {
    case "personal_sign":
      return personalSign(params[0], acct.privateKey);
    // eth_sign (raw-bytes blind signing, a known drainer vector) is deliberately NOT supported.
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
      let gas = hexToBig(tx.gas ?? tx.gasLimit);
      if (gas === 0n) {
        try {
          gas = ((await estimateGas(chain, { from: acct.address, to: tx.to, value: tx.value, data: tx.data })) * 12n) / 10n;
        } catch {
          gas = 250_000n;
        }
      }
      // Honor a dApp-supplied nonce; otherwise reserve one so this can't collide with an
      // overlapping in-app send racing for the same pending nonce.
      const suppliedNonce = tx.nonce != null ? hexToBig(tx.nonce) : null;
      const res = suppliedNonce == null ? await reserveNonce(chain, acct.address) : null;
      try {
        const fees = await getFees(chain);
        const evmTx: EvmTx = {
          chainId: chain.evmChainId,
          nonce: suppliedNonce ?? res!.nonce,
          maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
          maxFeePerGas: fees.maxFeePerGas,
          gasLimit: gas,
          to: tx.to,
          value: hexToBig(tx.value),
          data: tx.data || "0x",
        };
        const raw = signEip1559(evmTx, acct.privateKey);
        if (method === "eth_signTransaction") {
          res?.commit(); // the dApp will broadcast; assume the nonce is used
          return raw;
        }
        const hash = await sendRawTransaction(chain, raw);
        res?.commit();
        // If this was an ERC-20 approve(spender, amount) with a non-zero amount, remember it
        // so the user can find and revoke it later on the Token Approvals screen. An
        // approve(_, 0) is itself a revoke, so there's nothing to record.
        const data = (tx.data ?? "").toLowerCase();
        if (chain.evmChainId && data.startsWith("0x095ea7b3") && data.length >= 138) {
          const spender = "0x" + data.slice(34, 74);
          const amount = BigInt("0x" + (data.slice(74, 138) || "0"));
          if (amount > 0n) recordApproval(chain.evmChainId, tx.to, spender).catch(() => {});
        }
        return hash;
      } catch (e) {
        res?.rollback();
        throw e;
      }
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
