"use client";

import { useState } from "react";

export interface SearchBarProps {
  onSearch: (address: string) => void;
  loading?: boolean;
}

export default function SearchBar({ onSearch, loading }: SearchBarProps) {
  const [value, setValue] = useState("");

  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) onSearch(v);
      }}
    >
      <input
        className="flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 outline-none focus:border-neutral-500"
        placeholder="Paste a wallet or token mint address…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        spellCheck={false}
      />
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-teal-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-teal-400 disabled:opacity-50"
      >
        {loading ? "Scanning…" : "Scan"}
      </button>
    </form>
  );
}
