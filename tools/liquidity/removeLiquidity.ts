/**
 * Withdraw part (or all) of the treasury's LP position back to the treasury wallet.
 *
 *   POOL_ID=<poolId>  REMOVE_PCT=25   npm run remove     # withdraw 25% of the LP
 *   POOL_ID=<poolId>  REMOVE_LP=1000  npm run remove     # withdraw an exact LP amount
 *
 * Both sides (XGO + quote) come back, proportional to the LP burned. Use this to
 * unwind or rebalance — remember withdrawing removes fee-earning depth.
 */
import BN from "bn.js";
import { Percent } from "@raydium-io/raydium-sdk-v2";
import { initSdk, txVersion, die } from "./config";

async function main() {
  const poolId = process.env.POOL_ID;
  if (!poolId) die("Set POOL_ID (from create-pool).");

  const { raydium } = await initSdk();
  const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const { poolInfo, poolKeys } = data;

  // Owner's current LP balance for this pool.
  const lpMint = poolInfo.lpMint.address;
  const lpBal = await raydium.account.tokenAccounts.find((a) => a.mint.toBase58() === lpMint);
  if (!lpBal || lpBal.amount.isZero()) die("Treasury holds no LP for this pool.");

  let lpAmount: BN;
  if (process.env.REMOVE_LP) {
    lpAmount = new BN(process.env.REMOVE_LP);
  } else {
    const pct = Number(process.env.REMOVE_PCT || "100");
    if (!(pct > 0 && pct <= 100)) die("REMOVE_PCT must be between 1 and 100.");
    lpAmount = lpBal.amount.muln(pct).divn(100);
  }

  const { execute } = await raydium.cpmm.withdrawLiquidity({
    poolInfo,
    poolKeys,
    lpAmount,
    slippage: new Percent(1, 100), // 1%
    txVersion,
  });

  const { txId } = await execute({ sendAndConfirm: true });
  console.log(`\n✔ Withdrew ${lpAmount.toString()} LP to the treasury`);
  console.log(`  tx: https://solscan.io/tx/${txId}`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
