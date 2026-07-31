/**
 * Convert a UI amount to base units (wei / smallest unit). Uses the plain string form
 * (exact for typed decimals like "0.1"), and only falls back to toFixed for values JS
 * renders in scientific notation (< 1e-6 or ≥ 1e21) — where a few units of rounding at
 * the token's own precision is irrelevant. Avoids the `BigInt("1e-7…")` crash.
 */
export function toBaseUnits(uiAmount: number, decimals: number): bigint {
  if (!isFinite(uiAmount) || uiAmount <= 0) return 0n;
  let s = String(uiAmount);
  if (/e/i.test(s)) s = uiAmount.toFixed(Math.min(decimals, 100));
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(`${i || "0"}${frac}` || "0");
}
