"use client";

import dynamic from "next/dynamic";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import type { Graph, GraphLink, GraphNode } from "@/lib/analysis/graph";

// react-force-graph-2d touches `window`, so it must load client-side only.
// Cast to a permissive prop type: the library's generic node type doesn't know
// our custom node shape, so we type the accessors ourselves below.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
      Loading graph…
    </div>
  ),
}) as ComponentType<Record<string, unknown>>;

const LEGEND: { color: string; label: string }[] = [
  { color: "#f5d90a", label: "searched" },
  { color: "#fb923c", label: "CEX" },
  { color: "#a855f7", label: "whale" },
  { color: "#ef4444", label: "fresh" },
  { color: "#38bdf8", label: "program/AMM" },
  { color: "#2dd4bf", label: "wallet" },
];

function baseColor(n: GraphNode): string {
  if (n.center) return "#f5d90a";
  if (n.flags.includes("cex")) return "#fb923c";
  if (n.flags.includes("whale")) return "#a855f7";
  if (n.flags.includes("fresh")) return "#ef4444";
  if (n.flags.includes("burn")) return "#737373";
  if (n.labelType) return "#38bdf8";
  return "#2dd4bf";
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

/** Link endpoints are strings before the sim runs, node objects after. */
function endId(end: string | { id?: string }): string {
  return typeof end === "object" ? (end.id ?? "") : end;
}

export interface ForceGraphProps {
  data: Graph;
  /** Called when a node is clicked: focus the panel on it and expand its neighbors. */
  onNodeClick: (address: string) => void;
}

export default function ForceGraph({ data, onNodeClick }: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () =>
      setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Adjacency for hover highlighting.
  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of data.links) {
      const s = endId(l.source);
      const t = endId(l.target);
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s)!.add(t);
      map.get(t)!.add(s);
    }
    return map;
  }, [data]);

  const highlighted = (id: string) =>
    !hover || id === hover || adjacency.get(hover)?.has(id);

  const fit = () => fgRef.current?.zoomToFit?.(400, 60);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* Controls */}
      <div className="absolute right-3 top-3 z-10 flex gap-2">
        <button
          onClick={fit}
          className="rounded-md border border-neutral-700 bg-neutral-900/80 px-2.5 py-1 text-xs text-neutral-200 backdrop-blur hover:border-neutral-500"
        >
          Fit
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-wrap gap-x-3 gap-y-1 rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-2 text-xs text-neutral-300 backdrop-blur">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: l.color }}
            />
            {l.label}
          </span>
        ))}
      </div>

      {/* Hint */}
      <div className="absolute left-3 top-3 z-10 rounded-md bg-neutral-900/70 px-2.5 py-1 text-xs text-neutral-500 backdrop-blur">
        Click a node to expand its connections
      </div>

      {size.width > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="#0a0a0a"
          nodeRelSize={5}
          cooldownTicks={120}
          onEngineStop={() => fit()}
          nodeVal={(n: GraphNode) =>
            (n.center ? 6 : 2) +
            Math.min(8, Math.log10((n.value ?? 0) + 1)) +
            (n.flags.includes("whale") ? 6 : 0)
          }
          nodeColor={(n: GraphNode) =>
            highlighted(n.id) ? baseColor(n) : "rgba(120,120,120,0.25)"
          }
          nodeLabel={(n: GraphNode) => {
            const flags = n.flags.length ? ` [${n.flags.join(", ")}]` : "";
            return `${n.label ?? shortId(n.id)}${flags}`;
          }}
          linkColor={(l: GraphLink) => {
            if (!hover) return "rgba(255,255,255,0.18)";
            const on = endId(l.source) === hover || endId(l.target) === hover;
            return on ? "rgba(245,217,10,0.6)" : "rgba(255,255,255,0.05)";
          }}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={(l: GraphLink) =>
            hover && (endId(l.source) === hover || endId(l.target) === hover)
              ? 3
              : 0
          }
          linkWidth={(l: GraphLink) =>
            Math.min(4, Math.log10((l.value ?? 0) + 1) + 0.3)
          }
          onNodeHover={(n: GraphNode | null) => setHover(n?.id ?? null)}
          onNodeClick={(n: GraphNode) => onNodeClick(n.id)}
          nodeCanvasObjectMode={(n: GraphNode) =>
            n.center || n.label ? "after" : undefined
          }
          nodeCanvasObject={(
            n: GraphNode & { x?: number; y?: number },
            ctx: CanvasRenderingContext2D,
            globalScale: number
          ) => {
            if (n.x == null || n.y == null) return;
            const text = n.label ?? shortId(n.id);
            const fontSize = 11 / globalScale;
            ctx.font = `${fontSize}px ui-sans-serif, system-ui`;
            ctx.fillStyle = !highlighted(n.id)
              ? "rgba(160,160,160,0.4)"
              : n.center
                ? "#f5d90a"
                : "#e5e5e5";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(text, n.x, n.y + 7);
          }}
        />
      )}
    </div>
  );
}
