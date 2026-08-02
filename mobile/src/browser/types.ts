/** Shared types for the browser bridge + UI. */
import type { RequestSummary } from "../walletconnect/handlers";

/** A message posted from an injected provider in a page. */
export interface BridgeMessage {
  id: string;
  kind: "evm" | "solana";
  method: string;
  params: unknown;
  origin: string;
  host: string;
}

/** Reply back to the page's pending promise. `error` null = success. */
export type Responder = (result: unknown, error: { code?: number; message: string } | null) => void;

/** A request currently shown to the user for approval. */
export interface PendingRequest {
  msg: BridgeMessage;
  respond: Responder;
  /** "connect" shows the connect sheet; "sign" shows the decoded request sheet. */
  type: "connect" | "sign";
  summary: RequestSummary | null;
}

/** Per-tab UI state held by the browser screen. */
export interface TabState {
  id: string;
  /** URL to load (only changes on explicit navigation from the address bar / a shortcut). */
  uri: string;
  /** Live URL reported by the page (in-page navigation). */
  currentUrl: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
  /** Set to the URL when navigation was stopped by the phishing blocklist (shows the interstitial). */
  blocked?: string;
  /** Bumped to force-remount the WebView (used to load a URL the user chose to proceed to). */
  remountKey?: number;
}
