/**
 * Plain-English educational copy surfaced through the (?) HelpTip at every place
 * a user makes an irreversible key decision. Kept in one file so the wording stays
 * consistent everywhere and is easy to review/translate. No jargon without a
 * one-line explanation right next to it.
 */
export interface HelpTopic {
  title: string;
  /** Lead paragraphs, shown in order. */
  body: string[];
  /** Optional "do this" checklist. */
  dos?: string[];
  /** Optional "never do this" checklist. */
  donts?: string[];
  /** A final red-boxed warning line. */
  danger?: string;
}

export const EDU: Record<string, HelpTopic> = {
  treasuryFunding: {
    title: "How the treasury is funded",
    body: [
      "Two things pay into the community treasury, and both are automatic — nobody decides case by case.",
      "Swaps: a 0.44% community fee on trades, taken in whichever of the two tokens is more liquid — usually SOL. That keeps the treasury in assets it can actually use, instead of a pile of small holdings it can't. Trades involving XGO pay nothing, because XGO already carries its own fee and taxing both would be double-charging.",
      "XGO transfers: every XGO transfer carries a 1.11% fee. 1.00% goes to the treasury and 0.11% is burned — destroyed permanently, which permanently reduces the supply.",
      "These percentages are stated policy. What actually arrived is the deposits list further down, and every entry there can be checked on Solscan.",
    ],
  },
  seedPhrase: {
    title: "Your recovery phrase",
    body: [
      "Your recovery phrase (also called a seed phrase) is a list of 12 or 24 simple words. It IS your wallet — it's the master key that controls all your funds on every chain.",
      "Anyone who sees these words can take everything, instantly and permanently. And it's the ONLY way to restore your wallet if your phone is lost, stolen, broken, or reset.",
    ],
    dos: [
      "Write the words on paper, in order, by hand.",
      "Store it somewhere private — ideally two copies in two safe places.",
      "Keep it offline. Paper or metal beats anything digital.",
    ],
    donts: [
      "Never photograph or screenshot it.",
      "Never type it into a website, chat, email, or support ticket.",
      "Never share it with anyone — no real support team will ever ask for it.",
    ],
    danger:
      "We never receive or store your phrase. If you lose it, no one — not even us — can recover your funds.",
  },

  passphrase: {
    title: "Passphrase (the “25th word”)",
    body: [
      "A passphrase is an OPTIONAL extra secret you choose. It's mixed into your recovery phrase to unlock a separate, hidden wallet — one that the phrase alone can't open.",
      "It's an advanced feature. If you don't know you need it, you almost certainly don't — leave it blank and use your recovery phrase the normal way.",
      "There is no “wrong passphrase” warning. A different passphrase — even one typo, or an accidental extra space — quietly opens a completely different, empty wallet instead of yours.",
    ],
    dos: [
      "Remember it EXACTLY — it's case-sensitive and every character counts.",
      "Store it with your recovery phrase (you need both to restore).",
      "When importing, check the address preview matches before saving.",
    ],
    donts: [
      "Don't set one just because it exists — it's easy to lock yourself out.",
      "Don't rely on memory alone. Write it down.",
    ],
    danger:
      "A passphrase can't be reset or recovered. Lose it and the funds in that hidden wallet are gone forever, even with all your recovery words.",
  },

  selfCustody: {
    title: "Self-custody — what it means",
    body: [
      "This is a self-custody wallet: your keys live only on your device. You are the bank. That means total control — and total responsibility.",
      "There's no “forgot password”, no customer support that can reverse a transaction or restore access. Your recovery phrase is your only backup.",
    ],
    danger:
      "Protect your recovery phrase like it's the cash it controls — because it is.",
  },

  // ── The Association's own ideas ──────────────────────────────────────────────
  //
  // Everything above this line is about seed custody and treasury fees — real, and not what makes
  // this app different. A member could hold a Gateway Membership and never learn what one is.
  //
  // The hard constraint in all six: **the wallet describes the agreement, it does not enforce it.**
  // `property/deed.ts` puts it bluntly — "the copy in the UI must say what the app does, never that
  // it prevents anything" — because even for a right the app acts on, it is withholding its own
  // help rather than stopping a transfer that any other wallet could make. Copy that implies
  // protection the app cannot give is worse than no copy.

  keys: {
    title: "Keys",
    body: [
      "A Key is a token in your wallet that carries its terms with it. Not a receipt held by a company that could change its mind — the terms travel with the key, and the key is yours.",
      "There are two sorts, and telling them apart is the point of this app. STANDING is who you are: a membership, an office you hold, a certification you earned, a community you belong to. PROPERTY is what you own: a book, a course, music, software, a pass.",
      "The same technology underneath, either way. But your ordination and your audiobook are not the same kind of fact, so the app does not file them together.",
    ],
  },

  standing: {
    title: "Standing",
    body: [
      "Standing is what you are within the Association — a Gateway Membership, an office you hold, a certification, a community you belong to.",
      "It is granted, never bought. Someone confers it by issuing you a key. No amount of XGO changes it, and no tier is a substitute for it.",
      "It lives in the key itself rather than in an account on a server. There is no username to look up and no role someone could quietly edit. Hold the key, hold the standing — and when the key expires or leaves your wallet, the standing goes with it.",
    ],
  },

  deed: {
    title: "The deed",
    body: [
      "Most Keys carry a deed: the terms the key was issued under. Who created it, what you may do with it, whether you may pass it on, how long it lasts.",
      "A term can say three things, and the third is easy to miss. It can grant a right, deny it, or SAY NOTHING AT ALL. Silence is not denial — it means the issuer didn't address it, which is a different fact from “no”.",
      "The deed is a record, not a lock. The chain is the authority on who owns a key; the deed states what was agreed about it. Most terms are between you and the creator, and are matters for the Association and the law rather than for this screen.",
      "A few terms do change what this app does: it will decline to send a key whose deed forbids passing it on, and the deed decides whether a file may be kept on this device. Even then the app is withholding its own help — it cannot stop a key being moved with other software.",
    ],
  },

  soulbound: {
    title: "Keys that can't be sent",
    body: [
      "Some keys refuse to move. That is deliberate, not a fault or a setting someone forgot.",
      "Standing is about you. A membership or an office that could be handed to a stranger would mean nothing — so those keys are issued permanently bound to the wallet holding them. The network itself refuses the transfer; nobody can override it, including us.",
      "You'll see this on memberships, offices, credentials and community keys. Property — books, music, courses — can usually be sent, unless its own deed says otherwise.",
    ],
  },

  vault: {
    title: "The Vault",
    body: [
      "The Vault is where you read, watch and listen to what you own.",
      "The files stay on the Association's server rather than in your wallet — a key is small, a film is not. What your wallet holds is the proof of ownership.",
      "So opening something asks you to confirm: that proves the key is yours right now, and the server answers with the content. No password is involved, and nothing leaves your wallet.",
      "Once something is open it stays open for a while, so stepping out of the app and coming back doesn't start you over.",
    ],
  },

  votingWeight: {
    title: "Voting weight",
    body: [
      "Holding XGO gives your vote weight in decisions about the mission. Holding more gives it more weight; holding longer multiplies it.",
      "Your tokens never leave your wallet. No lock-up, no custody, and no payout — commitment is answered with a say, not with money.",
      "Weight is not standing. A tier measures what you hold: it confers no office, grants no membership, and gives no claim on the treasury. Standing comes from Keys, and cannot be bought.",
    ],
  },
};
