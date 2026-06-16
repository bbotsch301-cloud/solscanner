"use client";

import type { HeuristicFlag } from "@/lib/analysis/heuristics";
import type { Holder, TokenBalance } from "@/lib/chains/types";

export interface EntitySummary {
  address: string;
  type: "wallet" | "mint" | "program" | "unknown";
  label?: { name: string; type: string };
  info?: { firstSeen?: number; txCount?: number; lamports?: number };
  flags: HeuristicFlag[];
}

export interface BalancesData {
  kind: "wallet" | "mint";
  balances?: TokenBalance[];
  holders?: Holder[];
}

const FLAG_STYLE: Record<HeuristicFlag, string> = {
  fresh: "bg-red-500/20 text-red-300 border-red-500/40",
  whale: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  sniper: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  cex: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  program: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  burn: "bg-neutral-500/20 text-neutral-300 border-neutral-500/40",
};

function Badge({ flag }: { flag: HeuristicFlag }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-xs font-medium ${FLAG_STYLE[flag]}`}
    >
      {flag}
    </span>
  );
}

function short(id: string) {
  return id.length > 12 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}

export default function EntityPanel({
  entity,
  balances,
}: {
  entity: EntitySummary;
  balances?: BalancesData;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-400">
            {entity.type}
          </span>
          {entity.label && (
            <span className="text-sm font-medium text-teal-300">
              {entity.label.name}
            </span>
          )}
        </div>
        <p className="mt-1 break-all font-mono text-xs text-neutral-400">
          {entity.address}
        </p>
        {entity.flags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entity.flags.map((f) => (
              <Badge key={f} flag={f} />
            ))}
          </div>
        )}
        {entity.info && (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-400">
            {entity.info.firstSeen != null && (
              <>
                <dt>First seen</dt>
                <dd className="text-neutral-200">
                  {new Date(entity.info.firstSeen * 1000).toLocaleString()}
                </dd>
              </>
            )}
            {entity.info.txCount != null && (
              <>
                <dt>Recent txns</dt>
                <dd className="text-neutral-200">{entity.info.txCount}</dd>
              </>
            )}
            {entity.info.lamports != null && (
              <>
                <dt>SOL balance</dt>
                <dd className="text-neutral-200">
                  {(entity.info.lamports / 1e9).toFixed(4)}
                </dd>
              </>
            )}
          </dl>
        )}
      </div>

      {balances?.kind === "wallet" && balances.balances && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">
            Token balances
          </h3>
          <ul className="flex flex-col gap-1 text-xs">
            {balances.balances.slice(0, 25).map((b) => (
              <li
                key={b.mint}
                className="flex items-center justify-between gap-2 rounded bg-neutral-900 px-2 py-1"
              >
                <span className="truncate text-neutral-300">
                  {b.symbol ?? short(b.mint)}
                </span>
                <span className="font-mono text-neutral-400">
                  {b.amount.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                  {b.usdValue != null && (
                    <span className="ml-2 text-neutral-500">
                      ${b.usdValue.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  )}
                </span>
              </li>
            ))}
            {balances.balances.length === 0 && (
              <li className="text-neutral-500">No token balances.</li>
            )}
          </ul>
        </div>
      )}

      {balances?.kind === "mint" && balances.holders && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-neutral-200">
            Top holders
          </h3>
          <ul className="flex flex-col gap-1 text-xs">
            {balances.holders.slice(0, 25).map((h) => (
              <li
                key={h.owner}
                className="flex items-center justify-between gap-2 rounded bg-neutral-900 px-2 py-1"
              >
                <span className="truncate font-mono text-neutral-300">
                  {short(h.owner)}
                </span>
                <span className="font-mono text-neutral-400">
                  {h.amount.toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                  {h.pct != null && (
                    <span className="ml-2 text-neutral-500">
                      {(h.pct * 100).toFixed(2)}%
                    </span>
                  )}
                </span>
              </li>
            ))}
            {balances.holders.length === 0 && (
              <li className="text-neutral-500">No holders found.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
