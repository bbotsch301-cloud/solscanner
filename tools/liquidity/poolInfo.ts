/**
 * Read-only snapshot of the treasury pool: reserves, price, and the treasury's
 * LP position. Safe to run any time (no signing beyond RPC reads).
 *
 *   POOL_ID=<poolId>  npm run info
 */
import { initSdk, die } from "./config";

async function main() {
  const poolId = process.env.POOL_ID;
  if (!poolId) die("Set POOL_ID (from create-pool).");

  const { raydium } = await initSdk();
  const data = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const { poolInfo } = data;

  console.log(`\nPool ${poolId}`);
  console.log(`  ${poolInfo.mintA.symbol || "A"} / ${poolInfo.mintB.symbol || "B"}`);
  console.log(`  price:     ${poolInfo.price}`);
  console.log(`  reserve A: ${poolInfo.mintAmountA}`);
  console.log(`  reserve B: ${poolInfo.mintAmountB}`);
  console.log(`  TVL:       $${poolInfo.tvl ?? "?"}`);
  console.log(`  24h fees:  $${poolInfo.day?.volumeFee ?? "?"}`);

  const lpMint = poolInfo.lpMint.address;
  const lpBal = raydium.account.tokenAccounts.find((a) => a.mint.toBase58() === lpMint);
  if (lpBal && !lpBal.amount.isZero()) {
    const share =
      Number(lpBal.amount.toString()) / Number(poolInfo.lpAmount) || 0;
    console.log(`\n  Treasury LP: ${lpBal.amount.toString()} (${(share * 100).toFixed(2)}% of pool)`);
    console.log(
      "  CPMM trading fees auto-compound into these reserves — LP value grows; realize by withdrawing."
    );
  } else {
    console.log("\n  Treasury holds no LP for this pool.");
  }
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
