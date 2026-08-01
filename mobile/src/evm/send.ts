/**
 * Compose RPC + signing into "send" operations for EVM chains. All amounts are in
 * UI units and converted here; gas is estimated with a safety margin.
 */
import type { ChainDef } from "../chains/registry";
import { estimateGas, getFees, getNonce, sendRawTransaction } from "./rpc";
import { erc20TransferData, signEip1559, type EvmTx } from "./tx";
import { toBaseUnits } from "./units";

/** Send native ETH/BNB. Returns the tx hash. */
export async function sendNativeEvm(
  chain: ChainDef,
  privateKey: Uint8Array,
  from: string,
  to: string,
  uiAmount: number
): Promise<string> {
  const value = toBaseUnits(uiAmount, chain.decimals);
  const [nonce, fees] = await Promise.all([getNonce(chain, from), getFees(chain)]);
  const tx: EvmTx = {
    chainId: chain.evmChainId!,
    nonce,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maxFeePerGas: fees.maxFeePerGas,
    gasLimit: 21000n,
    to,
    value,
    data: "0x",
  };
  return sendRawTransaction(chain, signEip1559(tx, privateKey));
}

export interface EvmSendPreview {
  /** Estimated network fee in wei (gasLimit × capped maxFeePerGas). */
  feeWei: bigint;
  gasLimit: bigint;
}

/**
 * Dry-run a send BEFORE the user signs: fetch the (capped) fee and run `eth_estimateGas`,
 * which the node executes as a simulation and REVERTS if the transfer would fail — so a
 * doomed transaction is caught and the fee is shown up front, with nothing broadcast. The
 * gasLimit mirrors what the real send uses so the fee estimate matches what's actually paid.
 */
export async function previewEvmSend(
  chain: ChainDef,
  from: string,
  to: string,
  uiAmount: number,
  token?: { address: string; decimals: number }
): Promise<EvmSendPreview> {
  const fees = await getFees(chain);
  let gasLimit: bigint;
  if (token) {
    const data = erc20TransferData(to, toBaseUnits(uiAmount, token.decimals));
    try {
      gasLimit = ((await estimateGas(chain, { from, to: token.address, data })) * 12n) / 10n; // +20%
    } catch {
      throw new Error("This transfer is expected to fail — the token contract rejected a simulation. Nothing was sent.");
    }
  } else {
    const value = "0x" + toBaseUnits(uiAmount, chain.decimals).toString(16);
    try {
      await estimateGas(chain, { from, to, value });
    } catch {
      throw new Error("This transfer is expected to fail — most likely the balance can't cover the amount plus gas. Nothing was sent.");
    }
    gasLimit = 21_000n;
  }
  return { feeWei: gasLimit * fees.maxFeePerGas, gasLimit };
}

/** Send an ERC-20 token. Returns the tx hash. */
export async function sendTokenEvm(
  chain: ChainDef,
  privateKey: Uint8Array,
  from: string,
  tokenAddress: string,
  tokenDecimals: number,
  to: string,
  uiAmount: number
): Promise<string> {
  const data = erc20TransferData(to, toBaseUnits(uiAmount, tokenDecimals));
  const [nonce, fees] = await Promise.all([getNonce(chain, from), getFees(chain)]);
  let gasLimit = 90_000n;
  try {
    gasLimit = ((await estimateGas(chain, { from, to: tokenAddress, data })) * 12n) / 10n; // +20%
  } catch {
    /* keep the conservative default */
  }
  const tx: EvmTx = {
    chainId: chain.evmChainId!,
    nonce,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maxFeePerGas: fees.maxFeePerGas,
    gasLimit,
    to: tokenAddress,
    value: 0n,
    data,
  };
  return sendRawTransaction(chain, signEip1559(tx, privateKey));
}
