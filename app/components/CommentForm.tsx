"use client";

import { useEffect, useState } from "react";
import { getDisplayName, setDisplayName } from "@/lib/comments/identity";

export function CommentForm({
  onSubmit,
  placeholder = "Share your take…",
  compact = false,
}: {
  onSubmit: (author: string, body: string) => Promise<void>;
  placeholder?: string;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(getDisplayName());
  }, []);

  const submit = async () => {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const author = name.trim() || "anon";
    setDisplayName(author);
    try {
      await onSubmit(author, text);
      setBody("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          maxLength={40}
          className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder}
          rows={compact ? 2 : 3}
          maxLength={2000}
          className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500"
        />
      </div>
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !body.trim()}
          className="rounded-md bg-teal-500 px-4 py-1.5 text-sm font-medium text-neutral-950 hover:bg-teal-400 disabled:opacity-50"
        >
          {busy ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}
