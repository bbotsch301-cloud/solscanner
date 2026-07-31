/**
 * SERVER ONLY. The Raydium SDK is heavy and Node-oriented, so it never ships to the
 * browser — API routes call these helpers to (a) read the pool and (b) build an
 * *unsigned* add/remove-liquidity transaction that the user's wallet signs client-side.
 *
 * Signing model: we load the SDK with the user's PublicKey (no private key), build the
 * transaction, partial-sign any ephemeral signers the SDK generates (e.g. the temporary
 * wrapped-SOL account), then serialize it. The browser wallet adds the owner signature
 * and submits. Nothing here holds user keys.
 *
 * Untestable from the build sandbox (no mainnet, no funds, no pool yet) — the bar this
 * module clears is a clean typecheck + `next build`. SDK call shapes mirror the verified
 * `tools/liquidity` scripts and the official raydium-io/raydium-sdk-V2-demo.
 */
import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  Raydium,
  TxVersion,
  Percent,
  parseTokenAccountResp,
} from "@raydium-io/raydium-sdk-v2";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import Decimal from "decimal.js";
import { XGO_POOL_ID, type PoolSnapshot } from "./config";

class NotConfiguredError extends Error {
  constructor() {
    super("The XGO/SOL pool isn't live yet. Liquidity opens at launch.");
    this.name = "NotConfiguredError";
  }
}

function serverRpc(): string {
  return (
    process.env.MAINNET_RPC ??
    process.env.NEXT_PUBLIC_MAINNET_RPC ??
    "https://api.mainnet-beta.solana.com"
  );
}

function requirePool(): string {
  const id = XGO_POOL_ID.trim();
  if (!id) throw new NotConfiguredError();
  return id;
}

async function load(owner?: PublicKey): Promise<{ raydium: Raydium; connection: Connection }> {
  const connection = new Connection(serverRpc(), "confirmed");
  const raydium = await Raydium.load({
    connection,
    cluster: "mainnet",
    owner,
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: "finalized",
  });

  if (owner) {
    // Read the owner's token accounts (both programs) so LP lookups + ATA logic resolve.
    const [legacy, token2022, sol] = await Promise.all([
      connection.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      connection.getTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
      connection.getAccountInfo(owner),
    ]);
    raydium.account.updateTokenAccount(
      parseTokenAccountResp({
        owner,
        solAccountResp: sol,
        tokenAccountResp: {
          context: token2022.context,
          value: [...legacy.value, ...token2022.value],
        },
      })
    );
  }
  return { raydium, connection };
}

function baseUnits(whole: string, decimals: number): BN {
  const [i, f = ""] = whole.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  return new BN(new Decimal(`${i || "0"}${frac}`).toFixed(0));
}

/** Read-only pool snapshot, plus the owner's position when an address is given. */
export async function getSnapshot(ownerStr?: string): Promise<PoolSnapshot> {
  const poolId = requirePool();
  const owner = ownerStr ? new PublicKey(ownerStr) : undefined;
  const { raydium } = await load(owner);

  const { poolInfo } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  // Pool was created with mintA = XGO (base), mintB = SOL (quote).
  const xgo = Number(poolInfo.mintAmountA);
  const sol = Number(poolInfo.mintAmountB);
  const priceSolPerXgo = xgo > 0 ? sol / xgo : null;

  let position: PoolSnapshot["position"] = null;
  if (owner) {
    const lpMint = poolInfo.lpMint.address;
    const lp = raydium.account.tokenAccounts.find((a) => a.mint.toBase58() === lpMint);
    const totalLp = Number(poolInfo.lpAmount);
    if (lp && !lp.amount.isZero() && totalLp > 0) {
      const share = Number(lp.amount.toString()) / totalLp;
      position = { sharePct: share * 100, xgo: xgo * share, sol: sol * share };
    }
  }

  return {
    configured: true,
    poolId,
    priceSolPerXgo,
    reserves: { xgo, sol },
    tvlUsd: poolInfo.tvl ?? null,
    volume24hUsd: poolInfo.day?.volume ?? null,
    fees24hUsd: poolInfo.day?.volumeFee ?? null,
    position,
  };
}

/** Build an unsigned (ephemeral-partial-signed) add-liquidity tx, base64-encoded. */
export async function buildAddTx(
  ownerStr: string,
  xgoAmount: string,
  slippageBps: number
): Promise<string> {
  const poolId = requirePool();
  const owner = new PublicKey(ownerStr);
  const { raydium } = await load(owner);

  const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const inputAmount = baseUnits(xgoAmount, poolInfo.mintA.decimals);
  if (inputAmount.lten(0)) throw new Error("Enter an XGO amount.");

  const { transaction, signers } = await raydium.cpmm.addLiquidity({
    poolInfo,
    poolKeys,
    inputAmount,
    slippage: new Percent(slippageBps, 10000),
    baseIn: true, // amount denominated in XGO
    txVersion: TxVersion.V0,
  });

  if (signers.length) transaction.sign(signers);
  return Buffer.from(transaction.serialize()).toString("base64");
}

/** Build an unsigned remove-liquidity tx (withdraw `pct`% of the owner's LP), base64. */
export async function buildRemoveTx(ownerStr: string, pct: number): Promise<string> {
  const poolId = requirePool();
  if (!(pct > 0 && pct <= 100)) throw new Error("Choose a percentage between 1 and 100.");
  const owner = new PublicKey(ownerStr);
  const { raydium } = await load(owner);

  const { poolInfo, poolKeys } = await raydium.cpmm.getPoolInfoFromRpc(poolId);
  const lpMint = poolInfo.lpMint.address;
  const lp = raydium.account.tokenAccounts.find((a) => a.mint.toBase58() === lpMint);
  if (!lp || lp.amount.isZero()) throw new Error("You have no liquidity in this pool.");

  const lpAmount = lp.amount.muln(pct).divn(100);

  const { transaction, signers } = await raydium.cpmm.withdrawLiquidity({
    poolInfo,
    poolKeys,
    lpAmount,
    slippage: new Percent(1, 100), // 1%
    txVersion: TxVersion.V0,
  });

  if (signers.length) transaction.sign(signers);
  return Buffer.from(transaction.serialize()).toString("base64");
}

export { NotConfiguredError };
