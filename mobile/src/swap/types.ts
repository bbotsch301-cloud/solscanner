/**
 * Chain-agnostic swap types. A `UnifiedQuote` is what the Swap UI renders and what
 * `executeSwap` consumes, regardless of whether it came from Jupiter (Solana) or the
 * EVM meta-aggregator. The token identity (`SwapToken.mint`) holds the SPL mint on
 * Solana and the ERC-20 contract (or the native sentinel) on EVM.
 */
import type { SwapToken } from "../solana/swap";

/** EVM native-asset sentinel used by aggregators for ETH/BNB. */
export const EVM_NATIVE = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export function isEvmNative(mint: string): boolean {
  return mint.toLowerCase() === EVM_NATIVE.toLowerCase();
}

/** The router transaction a provider produces for execution. */
export interface EvmTxData {
  router: string; // to
  data: string; // calldata (0x…)
  value: bigint; // native value in wei (0 for token-in)
  gas?: bigint;
}

export interface EvmExec {
  /** Approval target; null when the input is native (no approval needed). */
  spender: string | null;
  inputMint: string; // ERC-20 contract or EVM_NATIVE
  amountInWei: bigint;
  /** Provider-specific final build (Kyber needs a second call; 0x already has it). */
  build: () => Promise<EvmTxData>;
}

export interface UnifiedQuote {
  provider: string; // "Jupiter" | "KyberSwap" | "0x"
  kind: "solana" | "evm";
  input: SwapToken;
  output: SwapToken;
  /** Expected output, UI units. */
  outUi: number;
  /** Minimum received after slippage, UI units. */
  minReceivedUi: number;
  priceImpactPct: number;
  routeLabels: string[];
  feeBps: number;
  /** Solana only: whether Jupiter charged the fee (else executeSwap self-collects it). */
  platformFeeApplied?: boolean;
  /** Live USD value of the input amount and of the expected output, from a token price feed.
   *  Undefined when no price is available (the UI then estimates the output side). */
  inUsd?: number;
  outUsd?: number;
  /** Solana execution payload (raw Jupiter quote). */
  solanaRaw?: unknown;
  /** EVM execution payload. */
  evm?: EvmExec;
  /** Solana treasury-routing display (optional). */
  venue?: "treasury" | "market";
  isTreasuryPair?: boolean;
  fellBack?: boolean;
  gapBps?: number | null;
  /** Solana only: executing also creates the treasury's fee account (one-time ~0.002 SOL rent). */
  feeAccountSetup?: boolean;
}

export type { SwapToken };
