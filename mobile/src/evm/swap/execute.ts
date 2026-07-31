/**
 * Execute an EVM swap: approve the ERC-20 input if the aggregator's router lacks
 * allowance, then sign + broadcast the router transaction. Native-in swaps skip the
 * approval. All signing via the verified src/evm/tx.ts signer.
 */
import type { ChainDef } from "../../chains/registry";
import type { EvmAccount } from "../../wallet/evm";
import type { UnifiedQuote } from "../../swap/types";
import { estimateGas, ethCall, getFees, getNonce, sendRawTransaction, waitForTx } from "../rpc";
import { erc20AllowanceData, erc20ApproveData, signEip1559, type EvmTx } from "../tx";

async function allowanceOf(chain: ChainDef, owner: string, token: string, spender: string): Promise<bigint> {
  const hex = await ethCall(chain, token, erc20AllowanceData(owner, spender));
  return BigInt(hex === "0x" ? "0x0" : hex);
}

export async function executeEvmSwap(
  chain: ChainDef,
  quote: UnifiedQuote,
  account: EvmAccount,
  onStatus?: (s: string) => void
): Promise<string> {
  const ex = quote.evm;
  if (!ex) throw new Error("Not an EVM quote.");
  const from = account.address;
  const chainId = chain.evmChainId!;

  // 1. Approve the router for the ERC-20 input, if needed. We approve the EXACT swap
  // amount (not an unlimited/infinite allowance), so no lingering approval survives the
  // swap — safer, at the cost of an approval tx per swap.
  if (ex.spender) {
    const allowance = await allowanceOf(chain, from, ex.inputMint, ex.spender);
    if (allowance < ex.amountInWei) {
      onStatus?.(`Approving ${quote.input.symbol}…`);
      const [nonce, fees] = await Promise.all([getNonce(chain, from), getFees(chain)]);
      const approve: EvmTx = {
        chainId,
        nonce,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
        maxFeePerGas: fees.maxFeePerGas,
        gasLimit: 70_000n,
        to: ex.inputMint,
        value: 0n,
        data: erc20ApproveData(ex.spender, ex.amountInWei),
      };
      const hash = await sendRawTransaction(chain, signEip1559(approve, account.privateKey));
      await waitForTx(chain, hash);
    }
  }

  // 2. Build (Kyber needs a second call) + send the swap.
  onStatus?.("Swapping…");
  const built = await ex.build();
  const [nonce, fees] = await Promise.all([getNonce(chain, from), getFees(chain)]);

  let gasLimit: bigint;
  if (built.gas && built.gas > 0n) {
    gasLimit = (built.gas * 12n) / 10n; // pad the aggregator estimate 20%
  } else {
    try {
      const est = await estimateGas(chain, {
        from,
        to: built.router,
        value: "0x" + built.value.toString(16),
        data: built.data,
      });
      gasLimit = (est * 12n) / 10n;
    } catch {
      gasLimit = 400_000n;
    }
  }

  const swap: EvmTx = {
    chainId,
    nonce,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    maxFeePerGas: fees.maxFeePerGas,
    gasLimit,
    to: built.router,
    value: built.value,
    data: built.data,
  };
  return sendRawTransaction(chain, signEip1559(swap, account.privateKey));
}
