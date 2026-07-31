"use client";

/** Anonymous browser identity for attribution + one-vote-per-browser. */
export function getVoterId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("voterId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("voterId", id);
  }
  return id;
}

export function getDisplayName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("displayName") ?? "";
}

export function setDisplayName(name: string): void {
  localStorage.setItem("displayName", name.trim().slice(0, 40));
}
