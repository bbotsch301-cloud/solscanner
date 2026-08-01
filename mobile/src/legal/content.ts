/**
 * User-facing legal & security documents, shown in-app (More → Legal) and behind the first-run
 * acceptance gate. Content lives here as Markdown-ish strings so editing is trivial.
 *
 * IMPORTANT — keeping these current ("update if things change"):
 *   • Whenever a document changes MATERIALLY, bump LEGAL_VERSION and update LAST_UPDATED.
 *   • Bumping LEGAL_VERSION re-triggers the one-time acceptance gate (getAcceptedLegalVersion()
 *     in security/prefs.ts is compared against it), so users re-acknowledge the new terms.
 *
 * These are solid drafts, NOT a substitute for review by a qualified lawyer. Fill the bracketed
 * placeholders ([LEGAL ENTITY], [GOVERNING JURISDICTION]) before publishing to the app stores,
 * which additionally require a PUBLICLY HOSTED privacy-policy URL (this same text can be hosted).
 */

export const LEGAL_VERSION = 1;
export const LAST_UPDATED = "August 1, 2026";

export type LegalDocKey = "privacy" | "terms" | "security";

const CONTACT_EMAIL = "support@globalgoshens.org";
const APP_NAME = "XGO";

const PRIVACY = `# Privacy Policy

_Last updated: ${LAST_UPDATED}_

${APP_NAME} is a self-custodial (non-custodial) crypto wallet published by [LEGAL ENTITY] ("we",
"us"). This policy explains what happens to your information when you use the app. The short
version: **we don't run accounts, we don't have servers that store your data, and we never receive
your keys or funds.**

## We are non-custodial
Your recovery phrase, private keys, and PIN are created and stored **only on your device**. We never
see them, receive them, or transmit them anywhere. We cannot access your wallet, move your funds, or
recover your keys for you. There is no ${APP_NAME} account and no sign-up.

## Information that stays on your device
The app stores the following locally and never sends it to us:
- Your recovery phrase / private keys, encrypted by your device's secure storage (and, if you set a
  PIN, encrypted again — see "How your keys are protected").
- Your address book (contacts you add), app preferences, and settings.
- Caches that make the app fast: token names/logos, recent prices, and your accounts' public
  addresses.

Uninstalling the app removes this data from the device. If you have not backed up your recovery
phrase, uninstalling will permanently destroy access to your funds.

## We do not collect analytics or track you
The app contains **no analytics, no advertising, no tracking SDKs, and no crash-reporting that sends
your usage to us**. We do not build a profile of you and we do not sell data (we have none to sell).

## Third-party services the app connects to
A blockchain wallet works by talking to public networks and data providers. When you use a feature,
the app sends requests to the relevant service. Those services can see the request — which typically
includes your **public wallet address** and your device's **IP address** — and each has its own
privacy practices that we do not control:
- **Blockchain RPC nodes** (Solana, Ethereum, BNB Smart Chain) to read balances and broadcast
  transactions.
- **Market & price data**: Jupiter, CoinGecko, GeckoTerminal, DexScreener, a gold-price API, and a
  currency-exchange-rate API.
- **Block explorers**: Solscan, Etherscan, BscScan (opened when you view a transaction).
- **Token metadata & images**: pump.fun, IPFS gateways, public token lists, and Jupiter's token API.
- **Name service**: Solana Name Service (via a public proxy) to resolve .sol names.
- **Swap aggregators**: Jupiter, KyberSwap, and 0x to quote and route swaps.
- **WalletConnect / Reown relay**: only when you connect to a dApp.
- **globalgoshens.org**: project and treasury information.

Your public address and on-chain transactions are, by the nature of public blockchains, **permanent
and visible to anyone** — this is not something any wallet can make private.

## Optional notifications
Receive alerts are **off by default**. In-app alerts (while the app is open) work entirely on your
device. If a future push-notification service is enabled, your device's push token and the **public
addresses** you want alerts for would be sent to that service (and Apple/Google's push relay) so it
can notify you. It would never receive your keys.

## Children
${APP_NAME} is not directed to children and is intended for adults only. We do not knowingly collect
information from anyone, including children.

## International use
The third-party services above may process requests on servers in other countries. By using the app
you understand your requests may be handled internationally.

## Changes to this policy
We may update this policy. When we make a material change, we update the "Last updated" date and ask
you to review and accept the updated documents in-app.

## Contact
Questions about privacy: ${CONTACT_EMAIL}
`;

const TERMS = `# Terms of Service

_Last updated: ${LAST_UPDATED}_

These Terms govern your use of the ${APP_NAME} wallet app, published by [LEGAL ENTITY] ("we", "us").
By using ${APP_NAME}, you agree to these Terms. If you do not agree, do not use the app.

## 1. Eligibility
You must be at least 18 years old and legally able to enter into this agreement to use ${APP_NAME}.

## 2. Non-custodial — you are in sole control
${APP_NAME} is self-custodial software. **You alone hold and control your recovery phrase, private
keys, PIN, and funds.** We do not custody assets, cannot access your wallet, and cannot move,
freeze, reverse, or recover anything on your behalf.

- **If you lose your recovery phrase, we cannot restore it, and your funds are permanently lost.**
- Anyone who obtains your recovery phrase or private keys can take your funds. Keep them secret and
  backed up offline.
- Blockchain transactions are irreversible. We cannot undo a transfer, a swap, or a send to a wrong
  or scam address.

## 3. No warranty
The app is provided **"as is" and "as available", without warranties of any kind**, express or
implied, including merchantability, fitness for a particular purpose, and non-infringement. We do
not warrant that the app will be uninterrupted, error-free, or that quotes, prices, or data shown
are accurate or timely.

## 4. Assumption of risk
Crypto assets are volatile and risky. By using ${APP_NAME} you accept the risks, including: price
volatility and total loss of value; smart-contract and DeFi protocol risk; swap slippage, price
impact, and failed or stuck transactions; network fees ("gas"); and the risk that a token has no
liquidity or is fraudulent. **You are responsible for your own decisions.**

## 5. Fees
- A community swap fee of **0.44%** applies to non-XGO swaps and flows to the Global Goshens
  treasury. Swaps involving XGO are exempt (XGO's own on-chain transfer fee applies instead).
- The XGO token carries an on-chain transfer fee (currently **1.11%**) set by its token program.
- Network ("gas") fees and any third-party aggregator fees also apply.

All applicable fees are disclosed in the app before you confirm a transaction.

## 6. Not financial, legal, or tax advice
Nothing in ${APP_NAME} is financial, investment, legal, or tax advice, an offer, or a solicitation
to buy or sell any asset. Information about XGO, the treasury, or the Kingdom Economy is provided for
general information only. Do your own research and consult your own advisors.

## 7. Third-party services
${APP_NAME} interacts with independent third-party networks and services (RPC providers, price and
market-data providers, swap aggregators, explorers, WalletConnect, and others). We do not control
them and are not responsible for their availability, accuracy, fees, or actions. Your use of them may
be subject to their own terms.

## 8. Acceptable use & compliance
You agree to use ${APP_NAME} only for lawful purposes, to comply with all laws that apply to you
(including sanctions and anti-money-laundering laws), and not to use the app if you are barred from
doing so. You are solely responsible for determining and paying any taxes on your activity.

## 9. Limitation of liability
To the maximum extent permitted by law, we and our contributors will not be liable for any indirect,
incidental, special, consequential, or exemplary damages, or for any loss of funds, profits, data,
or goodwill, arising from your use of (or inability to use) the app.

## 10. Indemnification
You agree to indemnify and hold us harmless from any claims or losses arising out of your use of the
app or your violation of these Terms or any law.

## 11. Governing law
These Terms are governed by the laws of [GOVERNING JURISDICTION], without regard to conflict-of-laws
rules.

## 12. Changes to these Terms
We may update these Terms. When we make a material change, we update the "Last updated" date and ask
you to review and accept the updated documents in-app. Continued use after that constitutes
acceptance.

## Contact
Questions about these Terms: ${CONTACT_EMAIL}
`;

const SECURITY = `# How your keys are protected

_Last updated: ${LAST_UPDATED}_

${APP_NAME} is built so that **you, and only you, control your wallet**. Here is how your keys are
generated, stored, and protected — in plain language.

## Keys are created and kept on your device
- Your 24-word recovery phrase is generated on your device using the operating system's secure random
  generator. The app refuses to create a wallet if a secure random source isn't available — it never
  falls back to weak randomness.
- Your keys for Solana, Ethereum, and BNB Smart Chain are all derived from that single phrase using
  standard, widely-compatible methods, so your phrase also restores your wallet in other major
  wallets.

## Secure storage, never synced
- Keys are stored using your device's encrypted, unlock-gated secure storage. They are **excluded
  from iCloud/Google backups and are never synced to the cloud or sent to us**.
- Each wallet you add is stored in its own protected slot. The app keeps only non-secret metadata
  (like labels) outside that protected storage.

## Optional PIN — a second lock
- Setting an app PIN adds a **second layer of encryption** over every stored secret. Your secrets are
  encrypted with a strong cipher under a key derived from your PIN.
- **Your PIN is never stored** — only the encrypted material and a random salt are. A wrong PIN
  simply fails to decrypt. The unlocked key is held in memory only while you're using the app and is
  cleared when the app goes to the background or auto-locks.
- Changing your PIN re-encrypts without touching your keys, and turning it on verifies everything can
  be read back so it can never lock you out.

## Optional biometrics
Face ID / fingerprint / device passcode can be enabled as a convenience lock. It's **off by default**
and you turn it on yourself.

## Protecting your recovery phrase
- The phrase is shown once for backup, with screenshots blocked and copy-to-clipboard disabled.
- Backing up is mandatory before you can use a new wallet.
- An optional passphrase (a "25th word") is supported for advanced users.

**Your responsibility:** your recovery phrase is the master key to your funds. Write it down and
store it offline somewhere safe. Anyone who has it controls your funds, and **no one — including us —
can recover it if it's lost.**

## Safer transactions
- Before you sign a send, the full destination address is shown to help you catch look-alike
  ("address poisoning") scams, along with recipient safety checks.
- Token swap approvals are for the exact amount needed — no lingering unlimited allowances.
- Every dApp (WalletConnect) request is decoded and shown to you, and must be explicitly approved.
`;

export const LEGAL_DOCS: Record<LegalDocKey, { title: string; body: string }> = {
  privacy: { title: "Privacy Policy", body: PRIVACY },
  terms: { title: "Terms of Service", body: TERMS },
  security: { title: "How your keys are protected", body: SECURITY },
};
