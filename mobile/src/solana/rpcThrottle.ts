/**
 * A global rate limiter for Solana RPC. The app fans out bursts of parallel requests
 * (the deposits feed alone looks up signatures for ~15 token accounts at once, on top of
 * balances, prices and metadata on every load). The public `api.mainnet-beta.solana.com`
 * endpoint has a tight per-IP limit, so those bursts trip HTTP 429 ("Server responded with
 * 429. Retrying after …").
 *
 * We pass `throttledFetch` as the Connection's `fetch`, so EVERY RPC call funnels through
 * one queue that caps concurrency and spaces request starts — smoothing bursts under the
 * limit without touching any call site. web3.js still retries the rare residual 429 itself.
 *
 * With a dedicated RPC (EXPO_PUBLIC_MAINNET_RPC) the limit is far higher; the throttle is a
 * safe no-op-ish ceiling there.
 */
const MAX_CONCURRENT = 3; // in-flight requests at once
const MIN_SPACING_MS = 140; // ~7 request starts/sec — under the public endpoint's soft cap

let active = 0;
let lastStart = 0;
const queue: Array<() => void> = [];

function pump(): void {
  if (queue.length === 0 || active >= MAX_CONCURRENT) return;
  const now = Date.now();
  const earliest = lastStart + MIN_SPACING_MS;
  if (now < earliest) {
    setTimeout(pump, earliest - now); // honor the minimum spacing between starts
    return;
  }
  const run = queue.shift()!;
  lastStart = now;
  active += 1;
  run();
  pump(); // try to fill remaining concurrency (re-defers on spacing)
}

export const throttledFetch: typeof globalThis.fetch = (input, init) =>
  new Promise<Response>((resolve, reject) => {
    queue.push(() => {
      fetch(input, init)
        .then(resolve, reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    });
    pump();
  });
