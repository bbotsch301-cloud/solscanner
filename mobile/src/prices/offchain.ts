/**
 * Live prices for off-chain treasury assets, from keyless public APIs. Best-effort —
 * callers fall back to the stated estimate in config/treasuryAssets.ts on any failure.
 *   - Silver spot (USD / troy oz): gold-api.com (keyless)
 *   - USD→IQD rate: open.er-api.com (keyless)
 */
export interface OffchainPrices {
  /** USD per troy ounce of silver. */
  silverPerOz?: number;
  /** Iraqi Dinar per 1 USD (divide an IQD amount by this to get USD). */
  iqdPerUsd?: number;
}

export async function fetchOffchainPrices(): Promise<OffchainPrices> {
  const out: OffchainPrices = {};
  await Promise.all([
    (async () => {
      try {
        const res = await fetch("https://api.gold-api.com/price/XAG");
        if (res.ok) {
          const j = (await res.json()) as { price?: number };
          if (typeof j.price === "number" && j.price > 0) out.silverPerOz = j.price;
        }
      } catch {
        /* keep fallback */
      }
    })(),
    (async () => {
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (res.ok) {
          const j = (await res.json()) as { rates?: Record<string, number> };
          const iqd = j.rates?.IQD;
          if (typeof iqd === "number" && iqd > 0) out.iqdPerUsd = iqd;
        }
      } catch {
        /* keep fallback */
      }
    })(),
  ]);
  return out;
}
