/**
 * ERC-20 approval history — the basis for the Token Approvals / revoke screen. On-chain
 * allowances can't be enumerated without an indexer, so instead we record every approval
 * THIS app grants (swap-router approvals + approvals the user signs for a dApp over
 * WalletConnect). The screen then reads the live allowance for each recorded (token,
 * spender) and offers a one-tap revoke.
 *
 * Scope caveat (surfaced in the UI): this only knows about approvals made through this app
 * on this device — not ones granted in another wallet. Same on-device store pattern as
 * safety/recipients.ts.
 */
import * as SecureStore from "expo-secure-store";

const KEY = "solwallet.approvals.v1";
const MAX = 200;

export interface ApprovalRef {
  chainId: number;
  token: string; // ERC-20 contract
  spender: string; // approved spender (router / dApp contract)
}

let history: ApprovalRef[] = [];
let loaded = false;

const idOf = (a: ApprovalRef) => `${a.chainId}:${a.token.toLowerCase()}:${a.spender.toLowerCase()}`;

/** Load recorded approvals (call once at startup). Best-effort. */
export async function loadApprovals(): Promise<void> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    history = raw ? (JSON.parse(raw) as ApprovalRef[]) : [];
  } catch {
    history = [];
  }
  loaded = true;
}

/** Record an approval the app just granted (de-duplicated, most-recent first, capped). */
export async function recordApproval(chainId: number, token: string, spender: string): Promise<void> {
  if (!loaded) await loadApprovals();
  const entry: ApprovalRef = { chainId, token, spender };
  const id = idOf(entry);
  history = [entry, ...history.filter((e) => idOf(e) !== id)].slice(0, MAX);
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(history));
  } catch {
    /* best-effort */
  }
}

/** Recorded approvals for a chain (the screen reads each one's live allowance). */
export function listApprovals(chainId: number): ApprovalRef[] {
  return history.filter((e) => e.chainId === chainId);
}
