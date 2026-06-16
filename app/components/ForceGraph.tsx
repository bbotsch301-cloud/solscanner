"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Graph, GraphNode } from "@/lib/analysis/graph";

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

function nodeColor(n: GraphNode): string {
  if (n.center) return "#f5d90a"; // searched entity
  if (n.flags.includes("cex")) return "#fb923c"; // orange
  if (n.flags.includes("whale")) return "#a855f7"; // purple
  if (n.flags.includes("fresh")) return "#ef4444"; // red
  if (n.flags.includes("burn")) return "#737373"; // gray
  if (n.labelType) return "#38bdf8"; // labeled program/amm/system
  return "#2dd4bf"; // default teal
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
}

export interface ForceGraphProps {
  data: Graph;
  /** Called when a node is clicked, to expand its neighbors. */
  onExpand: (address: string) => void;
}

export default function ForceGraph({ data, onExpand }: ForceGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

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

  return (
    <div ref={containerRef} className="h-full w-full">
      {size.width > 0 && (
        <ForceGraph2D
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="#0a0a0a"
          nodeRelSize={5}
          nodeVal={(n: GraphNode) =>
            (n.center ? 6 : 2) +
            Math.min(8, Math.log10((n.value ?? 0) + 1)) +
            (n.flags.includes("whale") ? 6 : 0)
          }
          nodeColor={(n: GraphNode) => nodeColor(n)}
          nodeLabel={(n: GraphNode) => {
            const flags = n.flags.length ? ` [${n.flags.join(", ")}]` : "";
            return `${n.label ?? shortId(n.id)}${flags}`;
          }}
          linkColor={() => "rgba(255,255,255,0.18)"}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          linkWidth={(l: { value?: number }) =>
            Math.min(4, Math.log10((l.value ?? 0) + 1) + 0.3)
          }
          onNodeClick={(n: GraphNode) => onExpand(n.id)}
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
            ctx.fillStyle = n.center ? "#f5d90a" : "#e5e5e5";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillText(text, n.x, n.y + 7);
          }}
        />
      )}
    </div>
  );
}
