/**
 * Design tokens — XGO / Global Goshens: warm black with metallic gold.
 * Premium, mission-driven, "the treasury, the mission, the future".
 */
export const colors = {
  bg: "#0A0A0C",
  bgElevated: "#141109",
  card: "#17140C",
  cardBorder: "#2E2613",
  text: "#F6F1E4",
  textMuted: "#A99F86",
  textFaint: "#6B6351",

  primary: "#E7B838", // XGO gold
  primaryDim: "#B8901F",
  accent: "#F3D27A", // light gold highlight

  positive: "#3FCF8E",
  negative: "#F0616D",
  warning: "#F0A93B",

  // Gold gradient for hero surfaces (treasury value, balance, voting power).
  gradA: "#8A6A12",
  gradB: "#F3D27A",
} as const;

/** Text/icon color that reads well on gold surfaces and primary buttons. */
export const onPrimary = "#0A0A0C";

export const spacing = (n: number) => n * 4;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const font = {
  h1: 34,
  h2: 22,
  h3: 17,
  body: 15,
  small: 13,
  tiny: 11,
} as const;

/** Short-form an address for display: AbCd…WxYz */
export function shortAddress(addr: string, lead = 4, tail = 4): string {
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** Format a USD amount. */
export function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n < 1 ? 4 : 2,
  });
}

/** Format a token amount with up to 4 decimals. */
export function amount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/** Compact large amounts so they never overflow: 2.94B, 1.2M, 5.0K. */
export function compact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
