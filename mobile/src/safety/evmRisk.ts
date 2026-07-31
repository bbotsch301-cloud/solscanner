/**
 * Recipient screening for EVM sends — keyless, RPC-only. Catches the common,
 * fund-losing mistakes: sending to a contract (tokens can be stuck), to the token's
 * own contract, to the burn address, or to yourself. Returns the same RiskReport
 * shape the Solana path uses so the UI renders one card.
 */
import type { ChainDef } from "../chains/registry";
import { getCode } from "../evm/rpc";
import type { RiskReport } from "./risk";

const ZERO = "0x0000000000000000000000000000000000000000";
const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export async function assessEvmRecipient(
  chain: ChainDef,
  to: string,
  self?: string | null,
  tokenAddress?: string | null
): Promise<RiskReport> {
  if (eq(to, ZERO)) {
    return { level: "danger", headline: "Burn address", reasons: ["This is the zero address — anything sent here is destroyed forever."], exists: false };
  }
  if (tokenAddress && eq(to, tokenAddress)) {
    return { level: "danger", headline: "That's the token's own contract", reasons: ["Sending a token to its own contract almost always loses it permanently."], exists: true };
  }
  if (eq(to, self)) {
    return { level: "caution", headline: "This is your own address", reasons: ["You're sending to yourself. Double-check that's what you intend."], exists: true };
  }
  try {
    const code = await getCode(chain, to);
    if (code && code !== "0x") {
      return {
        level: "caution",
        headline: "Contract address",
        reasons: ["This address is a smart contract, not a normal wallet. Only send if you're certain it can receive this asset — otherwise funds may be lost."],
        exists: true,
      };
    }
  } catch {
    /* RPC hiccup — don't block the send */
  }
  return { level: "safe", headline: "Address looks fine", reasons: ["No obvious red flags. Always double-check the full address."], exists: true };
}
