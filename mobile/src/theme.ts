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

/**
 * Semantic aliases layered over `colors`. Prefer these in new code so intent reads clearly
 * (a border is a `border`, text on a gold hero is `heroText`) without inventing new hex values.
 */
export const semantic = {
  onGold: onPrimary, // text/icon on a gold surface — same as onPrimary
  heroText: "#0A0A0C", // primary text on the gold gradient hero
  heroTextDim: "#0A0A0CAA", // secondary text on the gold hero
  heroOverlay: "#0A0A0C22", // subtle chip/dot fill on the gold hero
  border: colors.cardBorder,
  overlay: "#000000AA", // dim backdrop behind modals/sheets
  info: "#38bdf8", // informational blue (routes, notes)
} as const;

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

/** Font weights, named by role — replaces scattered raw "600"…"900" literals. */
export const weight = {
  medium: "600",
  semibold: "700",
  bold: "800",
  black: "900",
} as const;

/** Letter-spacing tokens (RN points). Negative tightens big display type. */
export const tracking = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
  wider: 1,
} as const;

/** Line-height multipliers for body copy. */
export const leading = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
} as const;

/**
 * Soft near-black shadow for raised surfaces (heroes, modals, the tab bar). Levels 1–3 go
 * from a subtle lift to a pronounced float. Returns a spreadable RN style (iOS shadow* +
 * Android elevation). Keep depth restrained — this is a refinement, not a drop-shadow reskin.
 */
export function elevation(level: 1 | 2 | 3 = 1) {
  const spec = {
    1: { radius: 6, offset: 2, opacity: 0.2 },
    2: { radius: 12, offset: 5, opacity: 0.28 },
    3: { radius: 22, offset: 10, opacity: 0.36 },
  }[level];
  return {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: spec.offset },
    shadowOpacity: spec.opacity,
    shadowRadius: spec.radius,
    elevation: level * 4,
  } as const;
}

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

/** Relative time from a unix-seconds timestamp: "5m ago", "3h ago", "2d ago". */
export function timeAgo(ts: number | null): string {
  if (!ts) return "";
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
