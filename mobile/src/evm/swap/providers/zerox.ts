/**
 * 0x Swap API v2 provider (AllowanceHolder flow). Best-in-class liquidity, but 0x
 * requires an API key — so this provider is inert unless a proxy URL or key is set:
 *   EXPO_PUBLIC_ZEROX_PROXY  — your Next.js proxy that injects the key server-side, or
 *   EXPO_PUBLIC_ZEROX_API_KEY — an embedded key (rate-limit risk only).
 * When neither is set, `zeroxProvider` returns null and the meta-aggregator just uses
 * the other providers.
 */
import type { UnifiedQuote } from "../../../swap/types";
import type { EvmProvider, EvmQuoteParams } from "../provider";

const PROXY = process.env.EXPO_PUBLIC_ZEROX_PROXY ?? "";
const API_KEY = process.env.EXPO_PUBLIC_ZEROX_API_KEY ?? "";
const BASE = PROXY || "https://api.0x.org";

export const zeroxEnabled = Boolean(PROXY || API_KEY);

export const zeroxProvider: EvmProvider = async (p: EvmQuoteParams): Promise<UnifiedQuote | null> => {
  if (!zeroxEnabled || !p.chain.evmChainId) return null;

  const params = new URLSearchParams({
    chainId: String(p.chain.evmChainId),
    sellToken: p.input.mint,
    buyToken: p.output.mint,
    sellAmount: p.amountInWei.toString(),
    taker: p.owner,
    slippageBps: String(p.slippageBps),
  });
  if (p.feeBps > 0 && p.feeRecipient) {
    params.set("swapFeeRecipient", p.feeRecipient);
    params.set("swapFeeBps", String(p.feeBps));
    params.set("swapFeeToken", p.output.mint); // fee taken from output
  }

  try {
    const headers: Record<string, string> = { "0x-version": "v2" };
    if (!PROXY && API_KEY) headers["0x-api-key"] = API_KEY;
    const res = await fetch(`${BASE}/swap/allowance-holder/quote?${params.toString()}`, { headers });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      buyAmount?: string;
      minBuyAmount?: string;
      transaction?: { to?: string; data?: string; value?: string; gas?: string };
      issues?: { allowance?: { spender?: string } | null };
    };
    if (!j.buyAmount || !j.transaction?.to || !j.transaction.data) return null;

    const outUi = Number(j.buyAmount) / 10 ** p.output.decimals;
    const minReceivedUi = j.minBuyAmount
      ? Number(j.minBuyAmount) / 10 ** p.output.decimals
      : (outUi * (10000 - p.slippageBps)) / 10000;
    const tx = j.transaction;

    return {
      provider: "0x",
      kind: "evm",
      input: p.input,
      output: p.output,
      outUi,
      minReceivedUi,
      priceImpactPct: 0,
      routeLabels: ["0x"],
      feeBps: p.feeBps,
      evm: {
        spender: j.issues?.allowance?.spender ?? null,
        inputMint: p.input.mint,
        amountInWei: p.amountInWei,
        build: async () => ({
          router: tx.to!,
          data: tx.data!,
          value: BigInt(tx.value ?? "0"),
          gas: tx.gas ? BigInt(tx.gas) : undefined,
        }),
      },
    };
  } catch {
    return null;
  }
};
