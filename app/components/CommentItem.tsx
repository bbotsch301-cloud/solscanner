"use client";

import { useState } from "react";
import type { CommentNode, VoteDir } from "@/lib/comments/types";
import { CommentForm } from "./CommentForm";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function CommentItem({
  node,
  isTop,
  depth,
  onVote,
  onReply,
}: {
  node: CommentNode;
  isTop?: boolean;
  depth: number;
  onVote: (id: string, dir: VoteDir) => void;
  onReply: (parentId: string, author: string, body: string) => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);

  return (
    <div
      className={`rounded-lg border p-3 ${
        isTop ? "border-teal-500/40 bg-teal-500/5" : "border-neutral-800 bg-neutral-900/40"
      }`}
    >
      <div className="flex gap-3">
        {/* Votes */}
        <div className="flex flex-col items-center gap-0.5 pt-0.5">
          <button
            onClick={() => onVote(node.id, "up")}
            className="text-neutral-500 hover:text-teal-400"
            aria-label="upvote"
          >
            ▲
          </button>
          <span className="text-sm font-semibold text-neutral-200">{node.score}</span>
          <button
            onClick={() => onVote(node.id, "down")}
            className="text-neutral-500 hover:text-red-400"
            aria-label="downvote"
          >
            ▼
          </button>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-teal-300">{node.author}</span>
            <span className="text-xs text-neutral-500">{timeAgo(node.createdAt)}</span>
            {isTop && (
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-teal-300">
                Top
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-200">{node.body}</p>
          <button
            onClick={() => setReplying((r) => !r)}
            className="mt-1 text-xs font-medium text-neutral-500 hover:text-neutral-300"
          >
            {replying ? "Cancel" : "Reply"}
          </button>

          {replying && (
            <div className="mt-2">
              <CommentForm
                compact
                placeholder={`Reply to ${node.author}…`}
                onSubmit={async (author, body) => {
                  await onReply(node.id, author, body);
                  setReplying(false);
                }}
              />
            </div>
          )}

          {node.replies.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 border-l border-neutral-800 pl-3">
              {node.replies.map((child) => (
                <CommentItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onVote={onVote}
                  onReply={onReply}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
