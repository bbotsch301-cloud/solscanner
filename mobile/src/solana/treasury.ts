/**
 * Treasury holdings. Read-only view of a public treasury address — anyone can
 * verify it on-chain, which is the whole point (radical transparency).
 *
 * TREASURY_ADDRESS is a single config value: swap it for the dedicated treasury
 * wallet when that's ready.
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "./connection";

/**
 * The main Global Goshens communal treasury. Set `EXPO_PUBLIC_GOSHENS_TREASURY` to the real
 * treasury address; the fallback is the current placeholder used while testing.
 */
const GOSHENS_TREASURY =
  process.env.EXPO_PUBLIC_GOSHENS_TREASURY || "AiNGsZZnrxZiefZAijrpYGe4gBFQSs7rQ2NRrYXXkwhk";

/**
 * The treasury address the app displays on Home + the Treasury tab: always the main Global
 * Goshens treasury. Deliberately independent of any Squads multisig — a connected multisig is
 * its own feature (its vault balance shows inside the multisig hub), so it never hijacks the
 * treasury view. Kept a function so a future runtime-set treasury address is a one-line change.
 */
export function treasuryAddress(): string {
  return GOSHENS_TREASURY;
}

export interface Holding {
  mint: string;
  amount: number;
  decimals: number;
  program: "legacy" | "token2022";
}

export interface Holdings {
  sol: number;
  tokens: Holding[];
}

export async function fetchHoldings(address: string): Promise<Holdings> {
  const pubkey = new PublicKey(address);
  const [lamports, legacy, token2022] = await Promise.all([
    connection.getBalance(pubkey),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const map = (
    res: Awaited<ReturnType<typeof connection.getParsedTokenAccountsByOwner>>,
    program: Holding["program"]
  ): Holding[] =>
    res.value.map((a) => {
      const info = a.account.data.parsed.info;
      return {
        mint: info.mint as string,
        amount: info.tokenAmount.uiAmount ?? 0,
        decimals: info.tokenAmount.decimals as number,
        program,
      };
    });

  const tokens = [...map(legacy, "legacy"), ...map(token2022, "token2022")].filter(
    (t) => t.amount > 0
  );
  return { sol: lamports / LAMPORTS_PER_SOL, tokens };
}
