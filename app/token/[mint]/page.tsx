import Link from "next/link";
import { TokenDiscussion } from "@/app/components/TokenDiscussion";
import { findShowcase, chainOf } from "@/lib/tokens/showcase";
import { fetchMarket } from "@/lib/tokens/dexscreener";

export const revalidate = 60;

function fmtPrice(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(2)}`;
}
function fmtCap(n: number | null): string {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export default async function TokenPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const [entry, market] = await Promise.all([
    Promise.resolve(findShowcase(mint)),
    fetchMarket(mint),
  ]);
  const name = entry?.name ?? market?.name ?? "Token";
  const change = market?.change24h ?? null;
  const chainBadge =
    market?.chainId === "solana"
      ? "SOL"
      : market?.chainId === "ethereum"
        ? "ETH"
        : market?.chainId === "bsc"
          ? "BNB"
          : chainOf(mint) === "evm"
            ? "EVM"
            : "SOL";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:text-amber-300">
        ← All tokens
      </Link>

      <section className="mt-4 flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        {market?.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={market.imageUrl} alt="" className="h-14 w-14 rounded-full bg-neutral-800 object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-lg font-bold text-amber-300">
            {name.slice(0, 2)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-bold text-neutral-100">{name}</h1>
            <span className="rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400">
              {chainBadge}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-lg text-neutral-100">{fmtPrice(market?.priceUsd ?? null)}</span>
            {change != null && (
              <span className={`text-sm font-semibold ${change >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Market cap {fmtCap(market?.marketCap ?? null)}
            {market?.dexUrl && (
              <>
                {" · "}
                <a href={market.dexUrl} target="_blank" rel="noreferrer" className="text-amber-300 hover:underline">
                  Chart / trade ↗
                </a>
              </>
            )}
          </div>
          <div className="mt-2 font-mono text-[11px] text-neutral-600 break-all">{mint}</div>
        </div>
      </section>

      <div className="mt-6">
        <TokenDiscussion mint={mint} tokenName={name} />
      </div>
    </main>
  );
}
