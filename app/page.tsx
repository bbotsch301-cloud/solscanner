import Link from "next/link";
import { SHOWCASE } from "@/lib/tokens/showcase";
import { resolveTokens } from "@/lib/tokens/resolve";

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

export default async function Home() {
  const tokens = await resolveTokens(SHOWCASE);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <section className="mb-8">
        <h1 className="text-3xl font-black text-amber-300 sm:text-4xl">The Gathering</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">
          A curated menagerie of tokens across Solana, Ethereum, and BNB Chain — gathered
          together to operate in unity. Live prices via DexScreener.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tokens.map((t) => {
          const change = t.change24h;
          const changeColor =
            change == null ? "text-neutral-500" : change >= 0 ? "text-emerald-400" : "text-red-400";
          return (
            <Link
              key={t.address}
              href={`/token/${t.address}`}
              className="group flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 transition hover:border-amber-500/50 hover:bg-neutral-900"
            >
              {t.logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={t.logo}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-full bg-neutral-800 object-cover"
                />
              ) : (
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-sm font-bold text-amber-300">
                  {t.name.slice(0, 2)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-neutral-100">{t.name}</span>
                  <span className="shrink-0 rounded-full border border-neutral-700 px-1.5 py-0.5 text-[10px] font-bold text-neutral-400">
                    {t.chainBadge}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-xs text-neutral-500">
                  {t.symbol ?? "—"}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="font-mono text-sm text-neutral-100">{fmtPrice(t.priceUsd)}</div>
                <div className={`text-xs font-semibold ${changeColor}`}>
                  {change == null ? "" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}%`}
                </div>
                <div className="text-[11px] text-neutral-500">MC {fmtCap(t.marketCap)}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
