/**
 * XGO identity + Token-2022 transfer-fee helpers. The fee is read live from the
 * mint on-chain, so whatever XGO's real rate is (1.11% each way) is always shown
 * accurately rather than hard-coded.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getTransferFeeConfig } from "@solana/spl-token";
import { connection } from "./connection";
import { toBaseUnits } from "../units";

export const XGO_MINT = "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7";

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

/** Total UI supply of a Token-2022 mint (for share-of-supply math). */
export async function getSupply(mint: string): Promise<number | null> {
  try {
    const mintAccount = await getMint(
      connection,
      new PublicKey(mint),
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );
    return Number(mintAccount.supply) / 10 ** mintAccount.decimals;
  } catch {
    return null;
  }
}

/** Fee (in UI units) charged on a transfer of `amount`. */
export function computeFee(amount: number, decimals: number, fee: TransferFee): number {
  const raw = toBaseUnits(amount, decimals);
  let feeRaw = (raw * BigInt(fee.bps)) / BigInt(10_000);
  if (feeRaw > fee.maxFee) feeRaw = fee.maxFee;
  return Number(feeRaw) / 10 ** decimals;
}
