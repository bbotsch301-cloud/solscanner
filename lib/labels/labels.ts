import labelsData from "./labels.json";

export type LabelType = "cex" | "amm" | "program" | "system" | "burn";

export interface Label {
  address: string;
  name: string;
  type: LabelType;
}

const LABELS: Label[] = (labelsData.labels as Label[]).filter(
  (l) => typeof l.address === "string"
);

const BY_ADDRESS = new Map<string, Label>(LABELS.map((l) => [l.address, l]));

/** Returns the known label for an address, or undefined. */
export function getLabel(address: string): Label | undefined {
  return BY_ADDRESS.get(address);
}

/** True if the address is a known CEX hot wallet. */
export function isCex(address: string): boolean {
  return BY_ADDRESS.get(address)?.type === "cex";
}

/** True if the address is a known program/AMM/system account (not a user wallet). */
export function isInfrastructure(address: string): boolean {
  const t = BY_ADDRESS.get(address)?.type;
  return t === "program" || t === "amm" || t === "system" || t === "burn";
}

export function allLabels(): Label[] {
  return LABELS;
}
