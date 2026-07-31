/**
 * XGO "staking" = non-custodial membership + loyalty. Holding XGO gives voting
 * weight; holding MORE and holding LONGER raises your tier and multiplies your
 * voting power. No lock-up, no custody, and no financial payout — commitment is
 * rewarded with governance weight and status, not money.
 *
 * All thresholds are config so they can be tuned before launch.
 */
export interface Tier {
  name: string;
  min: number; // XGO held
}

// Descending — first match wins.
export const TIERS: Tier[] = [
  { name: "Founder", min: 10_000_000 },
  { name: "Elder", min: 1_000_000 },
  { name: "Steward", min: 100_000 },
  { name: "Member", min: 1 },
];

export function tierFor(amount: number): { current: Tier | null; next: Tier | null; toNext: number } {
  const current = TIERS.find((t) => amount >= t.min) ?? null;
  const asc = [...TIERS].sort((a, b) => a.min - b.min);
  const next = asc.find((t) => t.min > amount) ?? null;
  return { current, next, toNext: next ? next.min - amount : 0 };
}

// Loyalty multiplier by continuous days held (descending).
export const LOYALTY: { days: number; mult: number; label: string }[] = [
  { days: 365, mult: 2.0, label: "1 year+" },
  { days: 90, mult: 1.5, label: "90 days+" },
  { days: 30, mult: 1.25, label: "30 days+" },
  { days: 0, mult: 1.0, label: "new" },
];

export function multiplierFor(firstSeenSec: number | null): { mult: number; label: string } {
  if (!firstSeenSec) return { mult: 1, label: "new" };
  const days = (Date.now() / 1000 - firstSeenSec) / 86_400;
  const tier = LOYALTY.find((l) => days >= l.days) ?? LOYALTY[LOYALTY.length - 1];
  return { mult: tier.mult, label: tier.label };
}
