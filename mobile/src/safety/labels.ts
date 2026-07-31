/**
 * Known-address labels for recipient screening — ported from the SolScanner
 * forensics engine. Program/system IDs are stable; CEX hot wallets are curated
 * from public explorer labels. `scam` is a (small, expandable) blocklist of
 * known drainer/scam addresses.
 */
export type LabelType = "cex" | "amm" | "program" | "system" | "burn" | "scam";

export interface Label {
  name: string;
  type: LabelType;
}

const LABELS: Record<string, Label> = {
  "11111111111111111111111111111111": { name: "System Program", type: "system" },
  TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA: { name: "Token Program", type: "system" },
  TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb: { name: "Token-2022 Program", type: "system" },
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: { name: "Associated Token Account Program", type: "system" },
  ComputeBudget111111111111111111111111111111: { name: "Compute Budget Program", type: "system" },
  "1nc1nerator11111111111111111111111111111111": { name: "Incinerator (Burn)", type: "burn" },

  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P": { name: "pump.fun", type: "program" },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: { name: "PumpSwap AMM", type: "amm" },
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM v4", type: "amm" },
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: { name: "Jupiter Aggregator", type: "amm" },
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: { name: "Orca Whirlpools", type: "amm" },

  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { name: "Binance (hot)", type: "cex" },
  H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS: { name: "Coinbase (hot)", type: "cex" },
  FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5: { name: "Kraken (hot)", type: "cex" },
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { name: "OKX (hot)", type: "cex" },

  // Known scam/drainer addresses go here (blocklist). Kept minimal for now.
};

export function getLabel(address: string): Label | undefined {
  return LABELS[address];
}
