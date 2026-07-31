/**
 * Shared config + SDK bootstrap for the treasury's protocol-owned-liquidity ops.
 *
 * These scripts run on MAINNET, from a trusted machine (not the mobile app, not
 * CI), signed with the treasury keypair. They are launch-gated: XGO must be live
 * on mainnet before a pool can be created. Nothing here can be exercised from the
 * build sandbox — no mainnet egress, no funds — so treat a clean `npm run
 * typecheck` as the bar this repo can clear, and the on-chain run as yours.
 *
 * The Raydium CPMM API shapes below are mirrored from the official demo repo
 * (raydium-io/raydium-sdk-V2-demo); verify against it before a mainnet run.
 */
import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { Raydium, TxVersion, parseTokenAccountResp } from "@raydium-io/raydium-sdk-v2";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";

/** Well-known mainnet mints. XGO is Token-2022 (1.11% transfer fee). */
export const MINTS = {
  XGO: "4a6CPi8mjbJvpWHajbSjd9CMbKL8UniByoSx7tomLJa7",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  SOL: "So11111111111111111111111111111111111111112",
} as const;

/** Where harvested LP fees / removed liquidity should land. */
export const TREASURY_ADDRESS = "AiNGsZZnrxZiefZAijrpYGe4gBFQSs7rQ2NRrYXXkwhk";

export const txVersion = TxVersion.V0;

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and fill it in before running mainnet ops.`
    );
  }
  return v;
}

/** Treasury signer, decoded from a base58 secret key in the environment. */
export function loadOwner(): Keypair {
  const raw = required("TREASURY_SECRET_KEY").trim();
  // Accept either a base58 string (Phantom export) or a JSON byte array.
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(raw));
}

export function rpcUrl(): string {
  return process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";
}

export function makeConnection(): Connection {
  return new Connection(rpcUrl(), "confirmed");
}

/**
 * Initialize the Raydium SDK for mainnet with the treasury as owner. Loads the
 * owner's token accounts so add/remove/harvest can find the right ATAs.
 */
export async function initSdk(): Promise<{
  raydium: Raydium;
  owner: Keypair;
  connection: Connection;
}> {
  const owner = loadOwner();
  const connection = makeConnection();

  const raydium = await Raydium.load({
    owner,
    connection,
    cluster: "mainnet",
    disableFeatureCheck: true,
    disableLoadToken: false,
    blockhashCommitment: "finalized",
  });

  // Preload owner token accounts (both token programs) so position ops resolve ATAs.
  const [legacy, token2022] = await Promise.all([
    connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID }),
    connection.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);
  raydium.account.updateTokenAccount(
    await parseTokenAccountResp({
      owner: owner.publicKey,
      solAccountResp: await connection.getAccountInfo(owner.publicKey),
      tokenAccountResp: {
        context: token2022.context,
        value: [...legacy.value, ...token2022.value],
      },
    })
  );

  return { raydium, owner, connection };
}

/** Small helper so scripts fail loudly instead of hanging. */
export function die(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}
