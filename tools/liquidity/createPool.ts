/**
 * Create + seed the treasury's own XGO pool on Raydium CPMM (constant product).
 *
 * Run ONCE at launch, on mainnet, with the treasury keypair. After this, Jupiter
 * routes XGO trades through whichever pool is deepest — so if this is the main XGO
 * liquidity, the app's existing swap flow already uses it and LP fees accrue to the
 * treasury with no app changes.
 *
 *   SEED_BASE=1000000  SEED_QUOTE=90  npm run create-pool          # XGO/SOL (default)
 *   POOL_QUOTE=USDC  SEED_BASE=1000000  SEED_QUOTE=25000  npm run create-pool  # XGO/USDC
 *
 * SEED_BASE  = XGO to deposit (whole tokens; base side)
 * SEED_QUOTE = quote to deposit (whole SOL or USDC) — sets the opening price
 * POOL_QUOTE = SOL (default) or USDC. XGO/SOL is the primary pool: SOL is Solana's
 *              universal routing hop, so an XGO/SOL pool sits on the XGO leg of
 *              almost every XGO trade, maximizing fee capture.
 *
 * CPMM (not CLMM) is deliberate: full-range constant product, permissionless
 * creation, and it supports Token-2022 mints with transfer fees (addSupportMintExt).
 */
import BN from "bn.js";
import Decimal from "decimal.js";
import { PublicKey } from "@solana/web3.js";
import {
  CREATE_CPMM_POOL_PROGRAM,
  CREATE_CPMM_POOL_FEE_ACC,
  getCpmmPdaAmmConfigId,
} from "@raydium-io/raydium-sdk-v2";
import { initSdk, MINTS, txVersion, die } from "./config";

function toBaseUnits(whole: string, decimals: number): BN {
  const [i, f = ""] = whole.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return new BN(new Decimal(`${i}${frac}`).toFixed(0));
}

async function main() {
  const quoteSym = (process.env.POOL_QUOTE || "SOL").toUpperCase();
  if (quoteSym !== "USDC" && quoteSym !== "SOL") die("POOL_QUOTE must be SOL or USDC.");
  const seedBase = process.env.SEED_BASE;
  const seedQuote = process.env.SEED_QUOTE;
  if (!seedBase || !seedQuote) die("Set SEED_BASE (XGO) and SEED_QUOTE amounts.");

  const { raydium, owner } = await initSdk();

  const quoteMint = quoteSym === "SOL" ? MINTS.SOL : MINTS.USDC;
  // getTokenInfo pulls decimals + program (Token-2022 vs legacy) for each side.
  const mintA = await raydium.token.getTokenInfo(MINTS.XGO); // base = XGO
  const mintB = await raydium.token.getTokenInfo(quoteMint); // quote = USDC/SOL

  const mintAAmount = toBaseUnits(seedBase, mintA.decimals);
  const mintBAmount = toBaseUnits(seedQuote, mintB.decimals);

  // Fee tiers come from Raydium's on-chain config list; [0] is the standard tier.
  const feeConfigs = await raydium.api.getCpmmConfigs();
  // On mainnet the config ids are canonical; the demo re-derives the PDA defensively.
  feeConfigs.forEach((cfg) => {
    cfg.id = getCpmmPdaAmmConfigId(CREATE_CPMM_POOL_PROGRAM, cfg.index).publicKey.toBase58();
  });

  console.log(
    `Creating CPMM pool XGO/${quoteSym} — seeding ${seedBase} XGO + ${seedQuote} ${quoteSym}`
  );
  console.log(`Owner (treasury): ${owner.publicKey.toBase58()}`);

  const { execute, extInfo } = await raydium.cpmm.createPool({
    programId: CREATE_CPMM_POOL_PROGRAM,
    poolFeeAccount: CREATE_CPMM_POOL_FEE_ACC,
    mintA,
    mintB,
    mintAAmount,
    mintBAmount,
    startTime: new BN(0), // trade immediately
    feeConfig: feeConfigs[0],
    associatedOnly: false,
    ownerInfo: { useSOLBalance: true },
    txVersion,
  });

  const { txId } = await execute({ sendAndConfirm: true });

  const poolId = (extInfo.address.poolId as PublicKey).toBase58();
  console.log("\n✔ Pool created");
  console.log(`  poolId: ${poolId}`);
  console.log(`  tx:     https://solscan.io/tx/${txId}`);
  console.log(
    "\nSave the poolId — addLiquidity / removeLiquidity / info / harvest all key off it (POOL_ID env)."
  );
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
