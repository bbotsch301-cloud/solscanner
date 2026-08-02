/**
 * XGO's transfer fee and where it goes: 1.11% on every XGO transfer — 1.00% to the community
 * treasury, 0.11% burned permanently. This is stated protocol config, not market data; price,
 * holders, and supply are read live on-chain (never hard-coded) and show "—" until XGO is listed.
 */
export const XGO_FEES = {
  /** Goes to the community treasury. */
  treasuryAllocation: 1.0,
  /** Destroyed permanently, reducing supply. */
  permanentBurn: 0.11,
};

/** Total XGO transfer fee % — 1.11%. */
export const XGO_FEE_TOTAL = XGO_FEES.treasuryAllocation + XGO_FEES.permanentBurn;

