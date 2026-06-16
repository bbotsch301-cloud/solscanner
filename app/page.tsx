"use client";

import { useCallback, useState } from "react";
import SearchBar from "./components/SearchBar";
import EntityPanel, {
  type BalancesData,
  type EntitySummary,
} from "./components/EntityPanel";
import ForceGraph from "./components/ForceGraph";
import { mergeGraphs, type Graph } from "@/lib/analysis/graph";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entity, setEntity] = useState<EntitySummary | null>(null);
  const [balances, setBalances] = useState<BalancesData | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);

  const search = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    setEntity(null);
    setBalances(null);
    setGraph(null);
    try {
      const entityRes = await fetch(
        `/api/entity?address=${encodeURIComponent(address)}`
      );
      const entityData = await entityRes.json();
      if (!entityRes.ok) throw new Error(entityData.error ?? "Lookup failed");
      setEntity(entityData);

      const kind = entityData.type === "mint" ? "mint" : "wallet";
      const [balRes, graphRes] = await Promise.all([
        fetch(
          `/api/balances?address=${encodeURIComponent(address)}&kind=${kind}`
        ),
        fetch(`/api/graph?address=${encodeURIComponent(address)}`),
      ]);
      const balData = await balRes.json();
      const graphData = await graphRes.json();
      if (balRes.ok) setBalances(balData);
      if (graphRes.ok) setGraph(graphData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const expand = useCallback(async (address: string) => {
    try {
      const res = await fetch(
        `/api/graph?address=${encodeURIComponent(address)}`
      );
      const sub = await res.json();
      if (!res.ok) return;
      setGraph((prev) => (prev ? mergeGraphs(prev, sub) : sub));
    } catch {
      // Expansion is best-effort; ignore transient failures.
    }
  }, []);

  return (
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800 px-6 py-4">
        <h1 className="text-lg font-semibold">
          SolScanner{" "}
          <span className="text-sm font-normal text-neutral-500">
            wallet &amp; token forensics
          </span>
        </h1>
        <div className="mt-3 max-w-2xl">
          <SearchBar onSearch={search} loading={loading} />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-neutral-800 p-4">
          {entity ? (
            <EntityPanel entity={entity} balances={balances ?? undefined} />
          ) : (
            <p className="text-sm text-neutral-500">
              Search a wallet or mint to begin. Click any node in the graph to
              expand its connections.
            </p>
          )}
        </aside>

        <section className="relative min-w-0 flex-1">
          {graph && graph.nodes.length > 0 ? (
            <ForceGraph data={graph} onExpand={expand} />
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
