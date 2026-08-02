/**
 * Why the community fee didn't reach the treasury.
 *
 * The fee is skimmed in a SECOND transaction after the swap lands (Jupiter declines to charge the
 * platform fee on some routes, notably SOL output). That transfer is deliberately best-effort — a
 * failed fee must never turn a successful swap into a failed one — which meant every failure
 * vanished into a `console.warn` no user could see. The treasury then reads "No deposits yet" and
 * there is no way to tell "never collected" from "collected but not displayed".
 *
 * This records the outcome of the last attempt so the swap screen can say what happened, and so
 * the Ecosystem screen can explain an empty deposits feed instead of implying zero volume.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "treasury.lastFeeAttempt.v1";

export interface FeeAttempt {
  /** When the attempt finished. */
  at: number;
  /** The swap that should have produced the fee. */
  swapSignature: string;
  outputMint: string;
  /** Fee in base units, as computed from the quote. */
  feeBase: string;
  /** "jupiter" = Jupiter charged it inline; "self" = we sent our own transfer. */
  route: "jupiter" | "self";
  ok: boolean;
  /** The fee transfer's signature when ok, else the failure reason. */
  detail: string;
}

let last: FeeAttempt | null = null;

export function getLastFeeAttempt(): FeeAttempt | null {
  return last;
}

export async function loadLastFeeAttempt(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) last = JSON.parse(raw) as FeeAttempt;
  } catch {
    /* best-effort */
  }
}

export function recordFeeAttempt(a: FeeAttempt): void {
  last = a;
  AsyncStorage.setItem(KEY, JSON.stringify(a)).catch(() => {});
  // Keep the console line too — it's the only trace when someone is watching the dev logs.
  console.log(`[treasury fee] ${a.route} ${a.ok ? "ok" : "FAILED"}: ${a.detail}`);
}
