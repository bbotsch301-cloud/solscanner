/**
 * Design tokens for the wallet. Dark-first, Solana-flavored palette.
 */
export const colors = {
  // Phantom-flavored: near-black with a violet cast, lavender as the hero accent.
  bg: "#12121A",
  bgElevated: "#1B1B26",
  card: "#20202C",
  cardBorder: "#2C2C3A",
  text: "#F7F7FB",
  textMuted: "#9B9BAC",
  textFaint: "#63636E",

  primary: "#AB9FF2", // Phantom lavender
  primaryDim: "#7A6FD6",
  accent: "#AB9FF2",

  positive: "#21E56F",
  negative: "#FF6B6B",
  warning: "#FFB020",

  // Violet → lavender gradient for the balance card / hero surfaces.
  gradA: "#5A4FCF",
  gradB: "#AB9FF2",
} as const;

/** Text/icon color that reads well on the lavender gradient and primary buttons. */
export const onPrimary = "#1A1130";

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

/** Format a token amount compactly. */
export function amount(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
