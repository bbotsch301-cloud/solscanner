/**
 * Working out what a QR code actually is.
 *
 * The scanner used to accept exactly one thing — a WalletConnect pairing URI — and answer everything
 * else with "Paste or scan a link that starts with `wc:`". Accurate and useless: it says what the app
 * wanted without saying what the scanner is *for*, so the most natural mistake in a wallet (pointing
 * the camera at another wallet's address) got a correction that didn't correct the misunderstanding.
 *
 * A camera in a wallet should recognise what it is looking at. A pairing code pairs; an address
 * starts a send.
 *
 * Pure and separate from the screen so every branch is reachable from a test — the camera is the one
 * part that can't be exercised without a device, and none of the deciding happens there.
 *
 * ## Deliberately not re-implemented here
 *
 * `wcUriFrom` (`walletconnect/deeplink.ts`) already recovers a pairing URI from both shapes a dApp
 * sends, including the unencoded one a query parser truncates. `detectKind` (`chains/addressKind.ts`)
 * already decides base58-Solana versus 0x-EVM and answers null for neither. Both are used rather than
 * echoed: a second copy of "is this an address" is how two answers to one question start to differ.
 */
import { detectKind } from "../chains/addressKind";
import { wcUriFrom } from "../walletconnect/deeplink";

export type Scanned =
  | { kind: "walletconnect"; uri: string }
  | {
      kind: "address";
      chain: "solana" | "evm";
      address: string;
      /** Only when the code stated one — a bare address never implies an amount. */
      amount?: string;
      /** SPL mint or ERC-20 contract, when the code named one. */
      token?: string;
    }
  /** `saw` is a truncated echo, so the message can describe what it got instead of one flat refusal. */
  | { kind: "unknown"; saw: string };

/** A QR can hold a kilobyte. An alert is not a debugger. */
const ECHO = 60;
const echo = (s: string): string => (s.length > ECHO ? `${s.slice(0, ECHO)}…` : s);

/**
 * The address out of a `solana:` or `ethereum:` payment URI, with whatever else it stated.
 *
 * Solana Pay is `solana:<recipient>?amount=&spl-token=`; EIP-681 is
 * `ethereum:<address>[@chainId]?value=`. Both put the recipient in the path, which is why the query
 * is parsed separately rather than the whole thing being handed to a URL parser — `solana:` is not a
 * hierarchical scheme and `new URL()` treats its path inconsistently.
 */
function fromPaymentUri(raw: string, scheme: "solana" | "ethereum"): Scanned | null {
  const rest = raw.slice(scheme.length + 1);
  if (!rest) return null;

  const q = rest.indexOf("?");
  // `@chainId` is EIP-681's way of naming a network. We take the address and ignore the chain: the
  // send happens on whichever EVM chain the wallet is on, and silently switching chains because of
  // something a camera saw is not a decision to make on someone's behalf.
  const path = (q < 0 ? rest : rest.slice(0, q)).split("@")[0];
  const params = new URLSearchParams(q < 0 ? "" : rest.slice(q + 1));

  const chain = detectKind(path);
  if (!chain) return null;
  if (scheme === "solana" && chain !== "solana") return null;
  if (scheme === "ethereum" && chain !== "evm") return null;

  const amount = params.get("amount") ?? params.get("value") ?? undefined;
  const token = params.get("spl-token") ?? params.get("address") ?? undefined;
  return { kind: "address", chain, address: path, ...(amount ? { amount } : {}), ...(token ? { token } : {}) };
}

/**
 * What this code is, or `unknown`.
 *
 * Never throws. This runs on every code the camera resolves, most of which will be something else
 * entirely — a URL on a poster, a wifi config, a boarding pass.
 */
export function parseScan(raw: string): Scanned {
  const s = (raw ?? "").trim();
  if (!s) return { kind: "unknown", saw: "" };

  // WalletConnect first: a pairing URI is unambiguous, and it is the only input that is a *request*
  // rather than a destination.
  const wc = wcUriFrom(s);
  if (wc) return { kind: "walletconnect", uri: wc };

  const lower = s.toLowerCase();
  if (lower.startsWith("solana:")) return fromPaymentUri(s, "solana") ?? { kind: "unknown", saw: echo(s) };
  if (lower.startsWith("ethereum:")) return fromPaymentUri(s, "ethereum") ?? { kind: "unknown", saw: echo(s) };

  const chain = detectKind(s);
  if (chain) return { kind: "address", chain, address: s };

  return { kind: "unknown", saw: echo(s) };
}

/**
 * A sentence for a code we couldn't use, describing what it looked like.
 *
 * One message for every failure is what made the old screen unhelpful. Naming the shape is what
 * turns "this didn't work" into "you scanned the wrong thing, and here is the right thing".
 */
export function describeUnknown(saw: string): string {
  if (!saw) return "That code was empty. Scan the QR a website shows to connect, or a wallet address to send to.";
  if (/^https?:\/\//i.test(saw))
    return "That's a web address, not something this wallet can act on. To connect to a site, scan the QR the site itself shows.";
  if (/^wc:/i.test(saw))
    return "That looks like a WalletConnect link but it's incomplete. Ask the site to show its QR code again.";
  return "That isn't a wallet address or a dApp link. Scan the QR a website shows to connect, or a wallet address to send to.";
}
