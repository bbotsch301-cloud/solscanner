/**
 * KyberSwap aggregator provider — keyless, covers Ethereum + BSC, and supports an
 * integrator fee (charged on the input currency). Two calls: /routes for the quote,
 * /route/build for the executable calldata (deferred to execute time).
 */
import { isEvmNative, type UnifiedQuote } from "../../../swap/types";
import type { EvmProvider, EvmQuoteParams } from "../provider";

const HOST = "https://aggregator-api.kyberswap.com";
const CLIENT_ID = "xgo-wallet";

function slug(chainId: string): string | null {
  return chainId === "ethereum" ? "ethereum" : chainId === "bsc" ? "bsc" : null;
}

interface RouteSummary {
  amountIn: string;
  amountInUsd?: string;
  amountOut: string;
  amountOutUsd?: string;
  route?: { exchange?: string }[][];
}

function routeLabels(rs: RouteSummary): string[] {
  try {
    const names = new Set<string>();
    for (const seq of rs.route ?? []) for (const hop of seq) if (hop.exchange) names.add(hop.exchange);
    return [...names].slice(0, 3);
  } catch {
    return [];
  }
}

export const kyberProvider: EvmProvider = async (p: EvmQuoteParams): Promise<UnifiedQuote | null> => {
  const chainSlug = slug(p.chain.id);
  if (!chainSlug) return null;

  let url =
    `${HOST}/${chainSlug}/api/v1/routes?tokenIn=${p.input.mint}` +
    `&tokenOut=${p.output.mint}&amountIn=${p.amountInWei.toString()}&gasInclude=true`;
  if (p.feeBps > 0 && p.feeRecipient) {
    url += `&feeAmount=${p.feeBps}&chargeFeeBy=currency_in&isInBps=true&feeReceiver=${p.feeRecipient}`;
  }

  try {
    const res = await fetch(url, { headers: { "x-client-id": CLIENT_ID } });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { routeSummary?: RouteSummary; routerAddress?: string } };
    const rs = j.data?.routeSummary;
    const router = j.data?.routerAddress;
    if (!rs?.amountOut || !router) return null;

    const outUi = Number(rs.amountOut) / 10 ** p.output.decimals;
    const minReceivedUi = (outUi * (10000 - p.slippageBps)) / 10000;
    const inUsd = Number(rs.amountInUsd ?? 0);
    const outUsd = Number(rs.amountOutUsd ?? 0);
    const priceImpactPct = inUsd > 0 && outUsd > 0 ? Math.max(0, (1 - outUsd / inUsd) * 100) : 0;

    const nativeIn = isEvmNative(p.input.mint);

    return {
      provider: "KyberSwap",
      kind: "evm",
      input: p.input,
      output: p.output,
      outUi,
      minReceivedUi,
      priceImpactPct,
      routeLabels: routeLabels(rs),
      feeBps: p.feeBps,
      evm: {
        spender: nativeIn ? null : router,
        inputMint: p.input.mint,
        amountInWei: p.amountInWei,
        build: async () => {
          const bRes = await fetch(`${HOST}/${chainSlug}/api/v1/route/build`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-client-id": CLIENT_ID },
            body: JSON.stringify({
              routeSummary: rs,
              sender: p.owner,
              recipient: p.owner,
              slippageTolerance: p.slippageBps,
              source: CLIENT_ID,
            }),
          });
          if (!bRes.ok) throw new Error(`KyberSwap build failed (${bRes.status})`);
          const bj = (await bRes.json()) as {
            data?: { data?: string; routerAddress?: string; transactionValue?: string; gas?: string };
          };
          const d = bj.data;
          if (!d?.data || !d.routerAddress) throw new Error("KyberSwap returned no transaction.");
          return {
            router: d.routerAddress,
            data: d.data,
            value: BigInt(d.transactionValue ?? (nativeIn ? p.amountInWei.toString() : "0")),
            gas: d.gas ? BigInt(d.gas) : undefined,
          };
        },
      },
    };
  } catch {
    return null;
  }
};
