/**
 * Builds a one-hop relationship graph centered on an address from normalized
 * transfers. The graph is intentionally one hop with a capped fan-out: the UI
 * expands further by re-centering on a clicked node and merging the result.
 * This is what keeps a busy wallet from melting into a hairball.
 */
import type { Transfer } from "../chains/types";
import { getLabel } from "../labels/labels";
import { classifyAddress, type HeuristicFlag } from "./heuristics";

export interface GraphNode {
  id: string;
  /** Known label name (CEX/program), if any. */
  label?: string;
  /** Label type (cex/amm/program/system/burn), if any. */
  labelType?: string;
  flags: HeuristicFlag[];
  /** Aggregated value flowing through this node (used for sizing). */
  value: number;
  /** True for the searched/centered node. */
  center?: boolean;
}

export interface GraphLink {
  source: string;
  target: string;
  /** Aggregated transfer amount along this directed edge. */
  value: number;
  mint: string;
}

export interface Graph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface BuildGraphOptions {
  center: string;
  /** Cap on neighbors kept (strongest edges by value). Default 50. */
  maxFanout?: number;
  /** Optional per-address metadata for richer flags (firstSeen, holdingPct). */
  nodeMeta?: Record<string, { firstSeen?: number; holdingPct?: number }>;
}

function makeNode(
  id: string,
  value: number,
  center: boolean,
  meta?: { firstSeen?: number; holdingPct?: number }
): GraphNode {
  const label = getLabel(id);
  return {
    id,
    label: label?.name,
    labelType: label?.type,
    value,
    center,
    flags: classifyAddress({
      address: id,
      firstSeen: meta?.firstSeen,
      holdingPct: meta?.holdingPct,
    }),
  };
}

export function buildGraph(transfers: Transfer[], opts: BuildGraphOptions): Graph {
  const center = opts.center;
  const maxFanout = opts.maxFanout ?? 50;

  // Aggregate edges that touch the center (one hop only).
  const linkMap = new Map<string, GraphLink>();
  for (const t of transfers) {
    // GraphLink uses source/target (react-force-graph convention); the normalized
    // Transfer uses source/destination.
    if (t.source !== center && t.destination !== center) continue;
    if (t.source === t.destination) continue;
    const key = `${t.source}->${t.destination}:${t.mint}`;
    const existing = linkMap.get(key);
    if (existing) existing.value += t.amount;
    else
      linkMap.set(key, {
        source: t.source,
        target: t.destination,
        value: t.amount,
        mint: t.mint,
      });
  }

  // Rank neighbors by total value exchanged with the center; keep the strongest.
  const neighborTotal = new Map<string, number>();
  for (const l of linkMap.values()) {
    const other = l.source === center ? l.target : l.source;
    neighborTotal.set(other, (neighborTotal.get(other) ?? 0) + l.value);
  }
  const keptNeighbors = new Set(
    [...neighborTotal.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxFanout)
      .map(([addr]) => addr)
  );

  const links = [...linkMap.values()].filter((l) => {
    const other = l.source === center ? l.target : l.source;
    return keptNeighbors.has(other);
  });

  const nodes: GraphNode[] = [
    makeNode(
      center,
      neighborTotal.size
        ? [...keptNeighbors].reduce((s, n) => s + (neighborTotal.get(n) ?? 0), 0)
        : 0,
      true,
      opts.nodeMeta?.[center]
    ),
    ...[...keptNeighbors].map((id) =>
      makeNode(id, neighborTotal.get(id) ?? 0, false, opts.nodeMeta?.[id])
    ),
  ];

  return { nodes, links };
}

/** Merge a freshly-expanded subgraph into an existing one, de-duplicating. */
export function mergeGraphs(base: Graph, addition: Graph): Graph {
  const nodes = new Map<string, GraphNode>();
  for (const n of base.nodes) nodes.set(n.id, n);
  for (const n of addition.nodes) {
    const existing = nodes.get(n.id);
    // Keep center status and richer flags if already present.
    if (existing) {
      nodes.set(n.id, {
        ...n,
        center: existing.center || n.center,
        value: Math.max(existing.value, n.value),
        flags: existing.flags.length >= n.flags.length ? existing.flags : n.flags,
      });
    } else {
      nodes.set(n.id, n);
    }
  }

  const links = new Map<string, GraphLink>();
  const key = (l: GraphLink) => `${l.source}->${l.target}:${l.mint}`;
  for (const l of [...base.links, ...addition.links]) {
    const existing = links.get(key(l));
    if (existing) existing.value = Math.max(existing.value, l.value);
    else links.set(key(l), { ...l });
  }

  return { nodes: [...nodes.values()], links: [...links.values()] };
}
