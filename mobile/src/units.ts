/**
 * Convert a UI amount to base units (lamports / wei / an SPL token's smallest unit) EXACTLY,
 * for any chain. Parses the decimal *string* and builds the BigInt from digits — it never does
 * `uiAmount * 10 ** decimals` in float, which silently loses precision for large amounts
 * (anything whose base-unit value exceeds Number.MAX_SAFE_INTEGER ≈ 9.007e15, e.g. billions of a
 * 9-decimal token). Only falls back to toFixed for values JS renders in scientific notation
 * (< 1e-6 or ≥ 1e21), where a unit of rounding at the token's own precision is irrelevant.
 */
export function toBaseUnits(uiAmount: number, decimals: number): bigint {
  if (!isFinite(uiAmount) || uiAmount <= 0) return 0n;
  let s = String(uiAmount);
  if (/e/i.test(s)) s = uiAmount.toFixed(Math.min(decimals, 100));
  const [i, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(`${i || "0"}${frac}` || "0");
}
