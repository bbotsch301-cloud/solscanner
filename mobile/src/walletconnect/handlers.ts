/**
 * Dispatch a WalletConnect session_request to the right signer. EVM signing is proven
 * against spec vectors (evm/message + evm/eip712 + evm/tx). Solana signing reuses the
 * Keypair + noble ed25519 + web3.js. Every path here runs only AFTER the user approves
 * the request in the UI.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import bs58 from "bs58";
import { signMessageBytes } from "../solana/signMessage";
import { Keypair, VersionedTransaction, type Connection } from "@solana/web3.js";
import { CHAINS } from "../chains/registry";
import type { EvmAccount } from "../wallet/evm";
import { personalSign } from "../evm/message";
import { signTypedData, type TypedData } from "../evm/eip712";
import { signEip1559, type EvmTx } from "../evm/tx";
import { estimateGas, getFees, sendRawTransaction } from "../evm/rpc";
import { reserveNonce } from "../evm/nonce";
import { recordApproval } from "../safety/approvals";
import { summarizeEvmData, summarizeSolanaTx } from "./decode";
import { SOLANA_CAIP2_BY_CLUSTER } from "./config";
import { CLUSTER } from "../solana/connection";

const hexToBig = (h?: string): bigint => (h && h !== "0x" ? BigInt(h) : 0n);

/**
 * The typed-data payload out of an `eth_signTypedData*` params array, whichever slot it is in.
 *
 * The two generations disagree about order, and the code read `params[1]` for both:
 *
 *   • `eth_signTypedData` (v1) is `[typedData, address]`
 *   • `eth_signTypedData_v4`   is `[address, typedData]`
 *
 * So legacy typed-data signing read an address where the payload should be, and `JSON.parse` threw.
 * It failed safe — nothing was mis-signed — but the method simply did not work, and the preview
 * showed "unknown" for every field.
 *
 * Detecting by shape rather than by method name is the point. The alternative, branching on the
 * method string, leaves the preview and the signer free to disagree about which argument is the
 * payload — and a preview that describes something other than what gets signed is worse than no
 * preview at all. One function, both callers.
 */
export function pickTypedData(params: any): TypedData | null {
  const candidates = Array.isArray(params) ? params : [params];
  for (const c of candidates) {
    let v: any = c;
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        continue; // an address, or anything else that isn't JSON
      }
    }
    if (v && typeof v === "object" && (v.types || v.primaryType || v.domain)) return v as TypedData;
  }
  return null;
}

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

/**
 * A Solana message as text, or the raw string when it isn't text.
 *
 * Same discipline as `decodeText` above: only show the decoded form when it is genuinely readable.
 * A message full of control characters is more honestly shown as-is than as mojibake that hides
 * what is being signed.
 */
function decodeSolanaMessage(message: unknown): string {
  const raw = String(message ?? "");
  if (!raw) return "(empty)";
  try {
    const txt = new TextDecoder().decode(bs58.decode(raw));
    const hasControl = [...txt].some((c) => {
      const code = c.charCodeAt(0);
      return code < 32 && code !== 9 && code !== 10 && code !== 13;
    });
    return hasControl || !txt ? raw.slice(0, 120) : txt.slice(0, 400);
  } catch {
    return raw.slice(0, 120);
  }
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
      // Same picker the signer uses, so the preview cannot describe a different argument.
      const td = pickTypedData(params) as any;
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
      // Decoded, not raw. The WalletConnect Solana profile sends this base58-encoded — which the
      // signer below decodes before signing — so showing the encoded form put an opaque blob in
      // front of someone being asked to approve it. That matters most for signing IN: the whole
      // defence against a hostile site harvesting a signature is that the member can read the
      // domain in the text first, and they cannot read base58. The EVM path already does this.
      return {
        title: "Solana message signature",
        lines: [{ label: "Message", value: decodeSolanaMessage(params?.message) }],
        danger: null,
      };
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
      const td = pickTypedData(params);
      if (!td) throw new Error("That request didn't contain readable typed data.");
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

/**
 * The signature THIS wallet just added — found by looking for it, not by assuming where it is.
 *
 * `VersionedTransaction.signatures` is `Uint8Array[]`, index-aligned to the required signers. Index 0
 * is the FEE PAYER, which is not always us. When it isn't, that slot is still 64 unfilled zero bytes,
 * and base58 encodes those as happily as a real signature — so returning `signatures[0]` handed the
 * dApp a valid-looking, entirely empty signature and said nothing.
 *
 * The case where this bites is not exotic, it is the flagship one: **issuing a Key** is 2–N
 * signatures over one session with a mint keypair co-signing, so the wallet routinely lands at index
 * 1 or later. A single-signer test passes with this bug fully intact, which is how it survived.
 *
 * See `scripts/check-walletconnect.cjs`, which builds a sponsored transaction and asserts that
 * `signatures[0]` fails ed25519 verification while the looked-up index passes.
 *
 * `staticAccountKeys` is the right list and needs no address-lookup-table resolution: lookup tables
 * cannot supply signers, so every required signer is always static.
 */
function ourSignature(tx: VersionedTransaction, keypair: Keypair): Uint8Array {
  const keys = tx.message.getAccountKeys().staticAccountKeys;
  const idx = keys
    .slice(0, tx.message.header.numRequiredSignatures)
    .findIndex((k) => k.equals(keypair.publicKey));
  if (idx < 0) throw new Error("This transaction doesn't ask for this wallet's signature.");

  const sig = tx.signatures[idx];
  // An unfilled slot is all zeroes. Refusing it is the whole point — a silently empty signature is
  // worse than a failed request, because the dApp accepts it and fails somewhere else entirely.
  if (!sig || sig.every((b) => b === 0))
    throw new Error("The wallet's signature is missing from the signed transaction.");
  return sig;
}

export async function handleSolanaRequest(
  method: string,
  params: any,
  keypair: Keypair,
  connection: Connection,
  /** The CAIP-2 chain the dApp asked for. Only broadcasting cares; see below. */
  chainId?: string
): Promise<any> {
  // The wallet advertises all three clusters, because a signature is valid wherever it lands and
  // refusing to pair over a network mismatch would refuse something harmless. **Broadcasting is a
  // different question**: `connection` points at whichever network the wallet is set to, so a dApp
  // asking to sign-and-send on devnet while the wallet sits on mainnet would put the transaction on
  // the wrong chain — silently, and irreversibly. Refuse that one, and say which is which.
  if (method === "solana_signAndSendTransaction" && chainId) {
    const active = SOLANA_CAIP2_BY_CLUSTER[CLUSTER];
    if (active && chainId !== active)
      throw new Error(
        `This request is for a different Solana network than the wallet is on. Switch the wallet to match, or ask the site to sign without sending.`
      );
  }

  switch (method) {
    case "solana_signMessage": {
      const sig = signMessageBytes(keypair, bs58.decode(params.message));
      return { signature: bs58.encode(sig) };
    }
    case "solana_signTransaction":
    case "solana_signAndSendTransaction": {
      const bytes = Uint8Array.from(Buffer.from(params.transaction, "base64"));

      // One path, deliberately. `VersionedTransaction.deserialize` accepts legacy wire format too —
      // it just reports `version === "legacy"` — so the `try VersionedTransaction / catch
      // Transaction.from` shape this replaces had a branch that could never be reached, and a
      // legacy-specific fix living inside it that could never run. Every transaction the Goshen web
      // app produces is legacy, so that dead branch was the one that mattered.
      const tx = VersionedTransaction.deserialize(bytes);
      // Throws if this wallet isn't among the required signers, which is the right answer to a dApp
      // asking us to sign something that doesn't want our signature.
      tx.sign([keypair]);

      if (method === "solana_signAndSendTransaction") {
        // A broadcast genuinely does need every signature; one the network would reject should fail
        // here with a clear error rather than there with an opaque one.
        const sig = await connection.sendRawTransaction(tx.serialize());
        return { signature: sig };
      }

      return {
        signature: bs58.encode(ourSignature(tx, keypair)),
        // Sign-only is exactly the case where a co-signer may legitimately still be missing — a dApp
        // collecting signatures one at a time, which is what issuing a Key does. `VersionedTransaction`
        // serializes an incomplete transaction without complaint, so no flag is needed here.
        transaction: Buffer.from(tx.serialize()).toString("base64"),
      };
    }
    default:
      throw new Error(`Unsupported Solana method: ${method}`);
  }
}
