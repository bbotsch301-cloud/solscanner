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
};
