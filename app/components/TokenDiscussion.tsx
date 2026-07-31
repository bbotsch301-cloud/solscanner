"use client";

import { useCallback, useEffect, useState } from "react";
import type { Comment, CommentNode, VoteDir } from "@/lib/comments/types";
import { getVoterId } from "@/lib/comments/identity";
import { CommentForm } from "./CommentForm";
import { CommentItem } from "./CommentItem";

function buildTree(list: Comment[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  list.forEach((c) => map.set(c.id, { ...c, score: c.up - c.down, replies: [] }));
  const roots: CommentNode[] = [];
  map.forEach((node) => {
    const parent = node.parentId ? map.get(node.parentId) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  });
  const sortNodes = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt);
    nodes.forEach((n) => sortNodes(n.replies));
  };
  sortNodes(roots);
  return roots;
}

function short(mint: string) {
  return mint.length > 12 ? `${mint.slice(0, 6)}…${mint.slice(-6)}` : mint;
}

export function TokenDiscussion({ mint, tokenName }: { mint: string; tokenName?: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/comments?mint=${encodeURIComponent(mint)}`);
    const data = await res.json();
    if (res.ok) setComments(data.comments ?? []);
    setLoading(false);
  }, [mint]);

  useEffect(() => {
    load();
  }, [load]);

  const post = useCallback(
    async (parentId: string | null, author: string, body: string) => {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, parentId, author, body }),
      });
      if (res.ok) await load();
    },
    [mint, load]
  );

  const vote = useCallback(
    async (id: string, dir: VoteDir) => {
      // Optimistic bump, then reconcile.
      setComments((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, up: dir === "up" ? c.up + 1 : c.up, down: dir === "down" ? c.down + 1 : c.down } : c
        )
      );
      await fetch("/api/comments/vote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, voterId: getVoterId(), dir }),
      });
      await load();
    },
    [load]
  );

  const tree = buildTree(comments);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 bg-neutral-950 px-4 py-8 text-neutral-100">
      <header>
        <h1 className="text-xl font-semibold">
          {tokenName ?? "Token"} <span className="text-neutral-500">discussion</span>
        </h1>
        <p className="mt-1 font-mono text-xs text-neutral-500">{short(mint)}</p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
        <CommentForm onSubmit={(author, body) => post(null, author, body)} />
      </section>

      <section className="flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : tree.length === 0 ? (
          <p className="text-sm text-neutral-500">No comments yet — be the first.</p>
        ) : (
          tree.map((node, i) => (
            <CommentItem
              key={node.id}
              node={node}
              isTop={i === 0}
              depth={0}
              onVote={vote}
              onReply={(parentId, author, body) => post(parentId, author, body)}
            />
          ))
        )}
      </section>
    </main>
  );
}
