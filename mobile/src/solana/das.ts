/**
 * Helius DAS fast-path — fetch a wallet's fungible tokens, balances, prices, AND metadata in ONE
 * `getAssetsByOwner` call, instead of the ~15 calls the default path makes (getBalance +
 * getParsedTokenAccountsByOwner ×2 + fetchPrices + per-token metadata). This is what makes big
 * wallets load Phantom-fast and slashes RPC cost at scale.
 *
 * Only works on a DAS-capable RPC (Helius, or the /api/rpc proxy pointed at Helius). The caller
 * gates on a dedicated RPC + a user opt-in and treats a null return as "fall back to the normal
 * path", so a non-Helius RPC (or any malformed response) can never break the balance display.
 */
import { PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { connection } from "./connection";
import { WSOL_MINT, type PriceInfo } from "./prices";
import type { SplToken } from "../wallet/WalletContext";

const T22 = TOKEN_2022_PROGRAM_ID.toBase58();

interface DasResult {
  lamports: number;
  tokens: SplToken[];
  prices: Record<string, PriceInfo>;
}

/** Returns the wallet's fungibles + native balance via DAS, or null to signal "use the fallback". */
export async function fetchAssetsViaDas(pubkey: PublicKey): Promise<DasResult | null> {
  try {
    const res = await fetch(connection.rpcEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "das",
        method: "getAssetsByOwner",
        params: {
          ownerAddress: pubkey.toBase58(),
          page: 1,
          limit: 1000,
          displayOptions: { showFungible: true, showNativeBalance: true },
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: DasReply };
    const result = json.result;
    if (!result || !Array.isArray(result.items)) return null;

    const tokens: SplToken[] = [];
    const prices: Record<string, PriceInfo> = {};
    for (const it of result.items) {
      const ti = it?.token_info;
      if (!ti || typeof ti.balance !== "number") continue; // fungible tokens only
      const decimals = ti.decimals ?? 0;
      const amount = ti.balance / 10 ** decimals;
      if (amount <= 0) continue;
      if (decimals === 0 && amount === 1) continue; // NFT-shaped → Collection gallery, not the token list
      const mint = it.id;
      tokens.push({
        mint,
        amount,
        decimals,
        program: ti.token_program === T22 ? "token2022" : "legacy",
        symbol: it.content?.metadata?.symbol,
        name: it.content?.metadata?.name,
        logoURI: it.content?.links?.image ?? it.content?.files?.[0]?.uri,
      });
      const price = ti.price_info?.price_per_token;
      if (typeof price === "number") prices[mint] = { usdPrice: price };
    }

    const nb = result.nativeBalance;
    const lamports = typeof nb?.lamports === "number" ? nb.lamports : 0;
    if (typeof nb?.price_per_sol === "number") prices[WSOL_MINT] = { usdPrice: nb.price_per_sol };

    return { lamports, tokens, prices };
  } catch {
    return null;
  }
}

// Minimal shape of the parts of the DAS response we read.
interface DasReply {
  items?: {
    id: string;
    content?: {
      metadata?: { symbol?: string; name?: string };
      links?: { image?: string };
      files?: { uri?: string }[];
    };
    token_info?: {
      balance?: number;
      decimals?: number;
      token_program?: string;
      price_info?: { price_per_token?: number };
    };
  }[];
  nativeBalance?: { lamports?: number; price_per_sol?: number };
}
