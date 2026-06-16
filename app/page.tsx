"use client";

import { useCallback, useState } from "react";
import SearchBar from "./components/SearchBar";
import EntityPanel, {
  type BalancesData,
  type EntitySummary,
} from "./components/EntityPanel";
import ForceGraph from "./components/ForceGraph";
import { mergeGraphs, type Graph } from "@/lib/analysis/graph";
import { DEMO_MINT, DEMO_WALLET } from "@/lib/demo/dataset";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntitySummary | null>(null);
  const [balances, setBalances] = useState<BalancesData | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [demo, setDemo] = useState(false);

  const qs = (address: string, isDemo: boolean, extra = "") =>
    `address=${encodeURIComponent(address)}${isDemo ? "&demo=1" : ""}${extra}`;

  // Load an entity into the side panel (entity summary + balances/holders).
  const loadPanel = useCallback(
    async (address: string, isDemo: boolean) => {
      const entityRes = await fetch(`/api/entity?${qs(address, isDemo)}`);
      const entityData = await entityRes.json();
      if (!entityRes.ok) throw new Error(entityData.error ?? "Lookup failed");
      setEntity(entityData);

      const kind = entityData.type === "mint" ? "mint" : "wallet";
      const balRes = await fetch(`/api/balances?${qs(address, isDemo, `&kind=${kind}`)}`);
      const balData = await balRes.json();
      if (balRes.ok) setBalances(balData);
    },
    []
  );

  const search = useCallback(
    async (address: string, isDemo = false) => {
      setLoading(true);
      setError(null);
      setEntity(null);
      setBalances(null);
      setGraph(null);
      setDemo(isDemo);
      try {
        const graphRes = fetch(`/api/graph?${qs(address, isDemo)}`);
        await loadPanel(address, isDemo);
        const gRes = await graphRes;
        const graphData = await gRes.json();
        if (gRes.ok) setGraph(graphData);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [loadPanel]
  );

  // Clicking a node both re-focuses the panel on it and expands its neighbors.
  const focusAndExpand = useCallback(
    async (address: string) => {
      try {
        const graphRes = fetch(`/api/graph?${qs(address, demo)}`);
        await loadPanel(address, demo).catch(() => {});
        const gRes = await graphRes;
        const sub = await gRes.json();
        if (gRes.ok) setGraph((prev) => (prev ? mergeGraphs(prev, sub) : sub));
      } catch {
        /* expansion is best-effort */
      }
    },
    [demo, loadPanel]
  );

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-block h-3 w-3 rounded-full bg-gradient-to-br from-teal-400 to-purple-500" />
            SolScanner{" "}
            <span className="text-sm font-normal text-neutral-500">
              wallet &amp; token forensics
            </span>
            {demo && (
              <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300">
                DEMO
              </span>
            )}
          </h1>
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => search(DEMO_WALLET, true)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500"
            >
              ▶ Demo wallet
            </button>
            <button
              onClick={() => search(DEMO_MINT, true)}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-neutral-300 hover:border-neutral-500"
            >
              ▶ Demo token
            </button>
          </div>
        </div>
        <div className="mt-3 max-w-2xl">
          <SearchBar onSearch={(a) => search(a, false)} loading={loading} />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 p-4">
          {entity ? (
            <EntityPanel
              entity={entity}
              balances={balances ?? undefined}
              isDemo={demo}
            />
          ) : (
            <div className="text-sm text-neutral-500">
              <p>
                Search a wallet or mint to begin. Click any node in the graph to
                expand its connections.
              </p>
              <p className="mt-3 text-neutral-600">
                No Helius key handy? Hit{" "}
                <span className="text-amber-300">Demo wallet</span> to explore a
                simulated pump.fun launch with zero setup.
              </p>
            </div>
          )}
        </aside>

        <section className="relative min-w-0 flex-1">
          {graph && graph.nodes.length > 0 ? (
            <ForceGraph data={graph} onNodeClick={focusAndExpand} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-600">
              {loading ? "Building graph…" : "No graph yet."}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
