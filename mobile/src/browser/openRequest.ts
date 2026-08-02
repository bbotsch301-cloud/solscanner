/**
 * Tiny handoff for "open this URL in the in-app Browser tab" from anywhere in the app (e.g. a
 * Collection item's "Open" action). The caller stores the URL and jumps to the Browser tab; the
 * BrowserScreen consumes it on focus and navigates its active tab there. Module-level like
 * navigationRef — no context needed.
 */
let pending: string | null = null;
let listener: ((url: string) => void) | null = null;

/** Queue a URL for the Browser tab (call right before navigating to it). */
export function requestBrowserUrl(url: string): void {
  if (listener) {
    listener(url);
  } else {
    pending = url;
  }
}

/** BrowserScreen registers here; any queued URL is delivered immediately. Returns unsubscribe. */
export function onBrowserUrlRequest(fn: (url: string) => void): () => void {
  listener = fn;
  if (pending) {
    const url = pending;
    pending = null;
    fn(url);
  }
  return () => {
    if (listener === fn) listener = null;
  };
}
