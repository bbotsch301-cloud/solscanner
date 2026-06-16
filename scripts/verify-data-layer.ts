/**
 * Manual data-layer verification. Requires HELIUS_API_KEY in the environment.
 *
 *   HELIUS_API_KEY=xxxx npx tsx scripts/verify-data-layer.ts [wallet] [mint]
 *
 * Runs the Solana adapter against a real wallet and a real mint, prints the
 * normalized shapes, and writes raw + normalized samples to data/fixtures/ so
 * the analysis layer and tests can run offline.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { solanaAdapter } from "../lib/chains/solana/adapter";

// Defaults: a pump.fun-era wallet and a token mint. Override via CLI args.
const WALLET = process.argv[2] ?? "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9";
const MINT = process.argv[3] ?? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // USDC

async function main() {
  if (!process.env.HELIUS_API_KEY) {
    console.error("HELIUS_API_KEY is required. See .env.local.example.");
    process.exit(1);
  }

  const fixturesDir = join(process.cwd(), "data", "fixtures");

  console.log(`\n=== classify(${WALLET}) ===`);
  console.log(await solanaAdapter.classify(WALLET));
  console.log(`\n=== classify(${MINT}) ===`);
  console.log(await solanaAdapter.classify(MINT));

  console.log(`\n=== getBalances(${WALLET}) ===`);
  const balances = await solanaAdapter.getBalances(WALLET);
  console.log(balances.slice(0, 5));
  writeFileSync(join(fixturesDir, "balances.json"), JSON.stringify(balances, null, 2));

  console.log(`\n=== getAccountInfo(${WALLET}) ===`);
  console.log(await solanaAdapter.getAccountInfo(WALLET));

  console.log(`\n=== getTransfers(${WALLET}) ===`);
  const transfers = await solanaAdapter.getTransfers(WALLET, { limit: 100 });
  console.log(`${transfers.length} transfers; first 5:`, transfers.slice(0, 5));
  writeFileSync(join(fixturesDir, "transfers.json"), JSON.stringify(transfers, null, 2));

  console.log(`\n=== getHolders(${MINT}) ===`);
  const holders = await solanaAdapter.getHolders(MINT, 50);
  console.log(`${holders.length} holders; first 5:`, holders.slice(0, 5));
  writeFileSync(join(fixturesDir, "holders.json"), JSON.stringify(holders, null, 2));

  console.log("\nWrote fixtures to data/fixtures/.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
