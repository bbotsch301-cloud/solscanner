/**
 * Recipient risk assessment — the wallet's "bodyguard". Combines on-chain signals
 * (account existence, age, history) with the SolScanner label set to flag risky
 * sends before they happen.
 */
import { PublicKey } from "@solana/web3.js";
import { connection } from "../solana/connection";
import { getLabel, type Label } from "./labels";
import { isBlockedSolana } from "./blocklist";

const FRESH_WALLET_DAYS = 7;

export type RiskLevel = "safe" | "info" | "caution" | "danger";

export interface RiskReport {
  level: RiskLevel;
  headline: string;
  reasons: string[];
  label?: Label;
  firstSeen?: number;
  txCount?: number;
  exists: boolean;
}

/** Assess a recipient address. Throws only if the address isn't valid base58. */
export async function assessRecipient(
  address: string,
  selfAddress?: string | null
): Promise<RiskReport> {
  const label = getLabel(address);

  // Known blocklist — hard stop, no network needed. Covers both the built-in labels and
  // the remotely-updatable scam/drainer list.
  if (label?.type === "scam" || isBlockedSolana(address)) {
    return {
      level: "danger",
      headline: "Flagged address",
      reasons: ["This address is on a known scam/drainer blocklist — do not send."],
      label,
      exists: true,
    };
  }
  if (label?.type === "burn") {
    return {
      level: "danger",
      headline: "Burn address",
      reasons: ["This is a burn address — anything sent here is destroyed."],
      label,
      exists: true,
    };
  }

  const pubkey = new PublicKey(address); // throws on invalid base58

  const [info, sigs] = await Promise.all([
    connection.getAccountInfo(pubkey).catch(() => null),
    connection.getSignaturesForAddress(pubkey, { limit: 1000 }).catch(() => []),
  ]);

  const exists = !!info;
  const times = sigs.map((s) => s.blockTime).filter((t): t is number => !!t);
  const firstSeen = times.length ? Math.min(...times) : undefined;
  const txCount = sigs.length;
  const base = { label, firstSeen, txCount, exists };

  if (selfAddress && address === selfAddress) {
    return { ...base, level: "caution", headline: "Your own wallet", reasons: ["You're sending to your own address."] };
  }

  if (label?.type === "program" || label?.type === "amm" || info?.executable) {
    return {
      ...base,
      level: "caution",
      headline: label?.name ?? "Program address",
      reasons: ["This is a program, not a personal wallet. Funds sent here may be lost."],
    };
  }

  if (label?.type === "cex") {
    return {
      ...base,
      level: "info",
      headline: label.name,
      reasons: ["Known exchange wallet. Exchange deposits sometimes need a memo/tag — double-check."],
    };
  }

  // A normal wallet's public key is always on the ed25519 curve. An off-curve key is a
  // program-derived address / token account, not a personal wallet — SOL sent there is
  // usually unrecoverable.
  if (!PublicKey.isOnCurve(pubkey.toBytes())) {
    return {
      ...base,
      level: "caution",
      headline: "Not a normal wallet",
      reasons: ["This address is off-curve (a program or token account, not a personal wallet). Funds sent here are very likely unrecoverable."],
    };
  }

  if (!exists || txCount === 0) {
    return {
      ...base,
      level: "caution",
      headline: "No activity yet",
      reasons: ["This address has no on-chain history. Make sure it's exactly right — a single wrong character sends to a stranger."],
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (firstSeen && now - firstSeen < FRESH_WALLET_DAYS * 86_400) {
    const days = Math.max(1, Math.floor((now - firstSeen) / 86_400));
    return {
      ...base,
      level: "caution",
      headline: "New wallet",
      reasons: [`First seen about ${days} day${days === 1 ? "" : "s"} ago — freshly created wallets are a common scam pattern.`],
    };
  }

  return {
    ...base,
    level: "safe",
    headline: "Looks safe",
    reasons: [`Established wallet with ${txCount >= 1000 ? "1000+" : txCount} recent transactions.`],
  };
}
