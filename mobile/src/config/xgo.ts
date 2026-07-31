/**
 * XGO protocol fee split shown on Buy/Swap (percentages of the trade). These are
 * the ecosystem's own fees — where value flows on every XGO trade. This is stated
 * protocol config, not market data; price, holders, and supply are read live
 * on-chain (never hard-coded) and simply show "—" until XGO is listed.
 */
export const XGO_FEES = {
  protocolAssessment: 1.0,
  treasuryAllocation: 0.89,
  permanentBurn: 0.11,
};

/** Total XGO protocol fee %. */
export const XGO_FEE_TOTAL =
  XGO_FEES.protocolAssessment + XGO_FEES.treasuryAllocation + XGO_FEES.permanentBurn;

