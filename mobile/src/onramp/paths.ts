/**
 * How money gets into a self-custody wallet — described, never brokered.
 *
 * A wallet with nothing in it is a dead end, and the app's answer to that was one sentence on the
 * Home card: "Send crypto to one of your addresses (tap Receive) to get started." That is only an
 * answer if you already have crypto. For someone arriving with none — which is everyone, once —
 * it names the last step of a process nobody has explained.
 *
 * ## The line this module draws, and why it is drawn in code
 *
 * XGO facilitates. It does not sell, buy, exchange, custody, broker, or take a cut. Everything here
 * is explanation and a hand-off; the purchase itself happens entirely between a member and a company
 * XGO has no relationship with.
 *
 * That posture is easy to state in copy and easy to erode in a diff. A referral code appended to a
 * provider link, an address prefilled into a provider's query string, a "recommended" badge on the
 * one that pays best — each is a small edit, and each moves the app from describing a purchase to
 * participating in one. So the boundary is expressed as machine-checkable invariants over this data
 * rather than as a paragraph in a README:
 *
 *   - `isNeutralUrl` — every provider link is a bare `https://host/`. No query, no fragment, no path.
 *     A referral parameter and a prefilled address are both query strings, so neither can be added
 *     without failing a test.
 *   - alphabetical order, asserted — the list cannot be quietly re-ranked, and there is no
 *     "recommended", "featured" or default selection to rank it into.
 *   - `FACILITATION` — the disclaimers are values with tests over them, not prose that drifts.
 *
 * ## Deliberately not here
 *
 * No SDK, no widget, no embedded checkout, no API key. Those are the shapes that put an app in the
 * flow of funds. Links open in the system's own browser (`openContentUrl`), where the member is
 * plainly on someone else's site rather than on a page that looks like ours.
 *
 * Pure and React-Native-free so every branch is reachable from a test.
 */
import type { ChainId } from "../chains/registry";

/** What the wallet is showing right now. Everything below is a function of this. */
export interface FundingContext {
  chainId: ChainId;
  /** "Solana", "Ethereum", "BNB Smart Chain". */
  chainName: string;
  /** "SOL", "ETH", "BNB" — the coin network fees are paid in on this chain. */
  symbol: string;
  /** Solana on devnet. Nothing here is real money, and the honest path is the faucet. */
  testNetwork: boolean;
}

export type PathId = "receive" | "buy" | "faucet";

export interface FundingPath {
  id: PathId;
  title: string;
  blurb: string;
  /**
   * Whether anyone besides the member and the chain is involved.
   *
   * Shown as a badge, and the reason `receive` is listed first: the path that needs no company, no
   * account and no identity check is the honest default, not the one an app monetises.
   */
  thirdParty: boolean;
}

/**
 * The ways in, best first.
 *
 * On the test network `buy` is absent rather than discouraged. Devnet SOL cannot be bought — it is
 * printed on request — so offering a purchase there would be offering to sell someone real money's
 * worth of nothing. The faucet leads instead, and says outright that none of it is real.
 */
export function fundingPaths(ctx: FundingContext): FundingPath[] {
  if (ctx.testNetwork) {
    return [
      {
        id: "faucet",
        title: "Get test SOL, free",
        blurb:
          "This wallet is on Solana's test network. The coins here are not real and have no value — they exist so things can be tried safely. The faucet hands them out on request.",
        thirdParty: false,
      },
      {
        id: "receive",
        title: "Receive from another wallet",
        blurb:
          "Someone can send test SOL to your address the same way they would real coins. Nothing else is involved.",
        thirdParty: false,
      },
    ];
  }

  return [
    {
      id: "receive",
      title: "You already have crypto somewhere",
      blurb: `If you hold ${ctx.symbol} in another wallet or on an exchange, send it to your ${ctx.chainName} address. No company, no account and no identity check — just a transfer between two addresses.`,
      thirdParty: false,
    },
    {
      id: "buy",
      title: "You're starting from nothing",
      blurb:
        "Crypto is bought from a company that sells it, using ordinary money. XGO doesn't sell it and isn't part of that purchase — this is a walkthrough of what to do, and where to do it.",
      thirdParty: true,
    },
  ];
}

/**
 * Two shapes of purchase, which lead to genuinely different steps.
 *
 * An **exchange** is an account you keep. You buy, the coins sit with the exchange, and you then
 * withdraw them to your own address — a separate action many people never take, which is how
 * "I bought crypto" and "I hold crypto" quietly become different things.
 *
 * An **on-ramp** is a one-off card purchase that sends straight to an address you give it. Fewer
 * steps, usually a worse rate, and the address is typed once with no second chance.
 */
export type ProviderKind = "exchange" | "onramp";

export interface Provider {
  name: string;
  /** A bare origin. Enforced by `isNeutralUrl` — see the module note. */
  url: string;
  kind: ProviderKind;
}

/**
 * A neutral list, alphabetical, unranked.
 *
 * Not endorsements and not exhaustive — well-known names, offered so that "find a company that
 * sells crypto" isn't left as an exercise for someone who has never done it. Which of these will
 * serve any given member depends on their country, and none of that is knowable from here, which is
 * why the screen says so rather than pretending to filter.
 */
export const PROVIDERS: readonly Provider[] = [
  { name: "Coinbase", url: "https://www.coinbase.com/", kind: "exchange" },
  { name: "Gemini", url: "https://www.gemini.com/", kind: "exchange" },
  { name: "Kraken", url: "https://www.kraken.com/", kind: "exchange" },
  { name: "MoonPay", url: "https://www.moonpay.com/", kind: "onramp" },
  { name: "Ramp", url: "https://ramp.network/", kind: "onramp" },
  { name: "Transak", url: "https://transak.com/", kind: "onramp" },
];

/**
 * True for a bare `https://host/` and nothing else.
 *
 * The mechanical form of "we are not in this transaction". A referral code, an affiliate id, a
 * prefilled address, a preselected amount and a deep link into a checkout are all query strings or
 * paths, so all of them fail here. Rejecting the *shape* rather than blocklisting parameter names
 * is what makes this hold against a parameter nobody has thought of yet.
 */
export function isNeutralUrl(url: string): boolean {
  return /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\/?$/.test(url);
}

export interface BuyStep {
  title: string;
  detail: string;
  /** Rendered as a warning rather than a step. Wrong-network withdrawals are unrecoverable. */
  warn?: boolean;
}

/**
 * What to select in a withdrawal screen, per chain.
 *
 * The single most expensive mistake available to a first-time buyer: an exchange asks which network
 * to send over, the names look interchangeable, and coins sent over the wrong one land at an address
 * that does not exist on that chain. There is no support desk for it and no way back.
 *
 * Typed against `ChainId`, so a chain added to the registry is a compile error here until the label
 * an exchange actually shows for it is written down.
 */
export const WITHDRAWAL_NETWORK: Record<ChainId, string> = {
  solana: "Solana (SOL)",
  ethereum: "Ethereum (ERC-20)",
  bsc: "BNB Smart Chain (BEP-20)",
};

/**
 * The walkthrough, for whichever kind of company the member picked.
 *
 * Every step is something they do somewhere else. Nothing in this list is an action the app takes
 * on their behalf, and that is the point — the app's entire contribution is knowing what the steps
 * are and what order they go in.
 */
export function buySteps(ctx: FundingContext, via: ProviderKind): BuyStep[] {
  const network = WITHDRAWAL_NETWORK[ctx.chainId];

  const copyAddress: BuyStep = {
    title: `Copy your ${ctx.chainName} address`,
    detail:
      "It's on this screen, and on Receive. This is where the coins land — it belongs to your wallet on this phone, and nobody else can spend from it.",
  };

  const arrives: BuyStep = {
    title: "Wait for it to arrive",
    detail:
      "There's nothing more to do in the app. It shows up on its own, usually within minutes — pull down on the Wallet tab to refresh.",
  };

  if (via === "onramp") {
    return [
      copyAddress,
      {
        title: "Open one of the services below",
        detail:
          "They'll ask for your card and, in most countries, some proof of identity. That's their requirement as a regulated business, not ours — XGO is not part of that account and cannot see it.",
      },
      {
        title: `Buy ${ctx.symbol} and paste your address as the destination`,
        detail: `Choose ${ctx.symbol} on ${ctx.chainName}, and paste the address you copied into the field asking where to send it. Check the first and last few characters against your own screen before you pay.`,
      },
      {
        title: "Pay",
        detail:
          "The payment, the rate and the fee are entirely between you and them. If it's declined, delayed or refunded, they're the ones who can tell you why — XGO can't see the purchase at all.",
      },
      arrives,
    ];
  }

  return [
    copyAddress,
    {
      title: "Open an account with an exchange",
      detail:
        "They'll ask for proof of identity and a way to pay. That's their requirement as a regulated business, not ours — XGO is not part of that account and cannot see it.",
    },
    {
      title: `Buy ${ctx.symbol}`,
      detail: `${ctx.chainName} charges its network fees in ${ctx.symbol}, so you need some of it even if what you actually want is a token. Start small — the first one is a rehearsal.`,
    },
    {
      title: `Withdraw to your address, on ${network}`,
      detail: `Find "withdraw" or "send", paste the address you copied, and choose ${network} as the network. Send a small amount first and confirm it lands before sending the rest.`,
    },
    {
      title: "Choosing the wrong network loses the coins",
      detail: `Exchanges list several networks with similar names. ${network} is the only one your address exists on. Anything sent over another network goes to an address nobody controls, and no one — not the exchange, not XGO — can bring it back.`,
      warn: true,
    },
    arrives,
  ];
}

/**
 * What XGO does and does not do here, in the plainest words available.
 *
 * `short` sits at the top of the screen, before anyone taps anything. `full` sits at the bottom,
 * after the steps, where someone who has read the whole thing can see the boundary stated once
 * properly. Both are values so a test can hold them to saying the things that actually matter —
 * no fee taken, no reversal possible, no advice given.
 */
export const FACILITATION = {
  short:
    "XGO doesn't sell crypto. This explains how to get some and points you at companies that do — the purchase happens entirely between you and them.",
  full: [
    "XGO never sells, buys, exchanges or holds crypto for you, and never touches your money. We take no fee and no commission on anything you do here, and we receive nothing if you use any of the services listed.",
    "Anything you do with one of those companies is your own agreement with them — their terms, their prices, their fees, their identity checks, their support. We cannot see your account, your purchase or your payment.",
    "If a purchase fails, is delayed, is refused or goes to the wrong place, we cannot reverse it, refund it or recover it. Nobody can. That is true of every transfer on a blockchain, including the ones you make yourself.",
    "None of this is financial advice, and no service listed is a recommendation. Availability, fees and limits differ by country — check before you sign up.",
  ],
} as const;
