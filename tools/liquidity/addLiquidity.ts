/**
 * Add liquidity to the treasury's existing CPMM pool (deepen the book).
 *
 *   POOL_ID=<poolId>  ADD_BASE=500000  npm run add
 *
 * ADD_BASE = XGO to add (whole tokens). The matching quote amount is computed from
 * the current pool ratio, capped by slippage. Deposits are balanced (both sides).
 */
import BN from "bn.js";
import Decimal from "decimal.js";
import { Percent } from "@raydium-io/raydium-sdk-v2";
import { initSdk, txVersion, die } from "./config";

function toBaseUnits(whole: string, decimals: number): BN {
  const [i, f = ""] = whole.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return new BN(new Decimal(`${i}${frac}`).toFixed(0));
}

async function main() {
  const poolId = process.env.POOL_ID;
  const addBase = process.env.ADD_BASE;
  if (!poolId) die("Set POOL_ID (from create-pool).");
  if (!addBase) die("Set ADD_BASE (XGO amount to add).");

  const { raydium } = await initSdk();

  const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const { poolInfo, poolKeys } = data;

  const inputAmount = toBaseUnits(addBase, poolInfo.mintA.decimals);
  const slippage = new Percent(1, 100); // 1%

  const { execute } = await raydium.cpmm.addLiquidity({
    poolInfo,
    poolKeys,
    inputAmount,
    slippage,
    baseIn: true, // amount is denominated in the base (XGO) side
    txVersion,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  console.log(`\n✔ Added ${addBase} XGO of liquidity`);
  console.log(`  tx: https://solscan.io/tx/${txId}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
