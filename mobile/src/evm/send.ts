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
