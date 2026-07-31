/**
 * XGO identity + Token-2022 transfer-fee helpers. The fee is read live from the
 * mint on-chain, so whatever XGO's real rate is (1.11% each way) is always shown
 * accurately rather than hard-coded.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getTransferFeeConfig } from "@solana/spl-token";
import { connection } from "./connection";

export const XGO_MINT = "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7";

export function isXgo(mint: string): boolean {
  return mint === XGO_MINT;
}

export interface TransferFee {
  bps: number; // basis points (111 = 1.11%)
  maxFee: bigint;
}

export async function getTransferFee(mint: string): Promise<TransferFee | null> {
  try {
    const mintAccount = await getMint(
      connection,
      new PublicKey(mint),
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    const cfg = getTransferFeeConfig(mintAccount);
    if (!cfg) return null;
    return {
      bps: cfg.newerTransferFee.transferFeeBasisPoints,
      maxFee: cfg.newerTransferFee.maximumFee,
    };
  } catch {
    return null;
  }
}

/** Fee (in UI units) charged on a transfer of `amount`. */
export function computeFee(amount: number, decimals: number, fee: TransferFee): number {
  const raw = BigInt(Math.round(amount * 10 ** decimals));
  let feeRaw = (raw * BigInt(fee.bps)) / 10_000n;
  if (feeRaw > fee.maxFee) feeRaw = fee.maxFee;
  return Number(feeRaw) / 10 ** decimals;
}
