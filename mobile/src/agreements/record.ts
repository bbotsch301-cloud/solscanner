/**
 * Agreement records — proof of what a member agreed to, and when.
 *
 * What this replaces: acceptance used to be a single integer, `solwallet.legalAccepted.v1`. That
 * records only that SOMEONE tapped Accept on this device, at an unknown time, to text nobody kept.
 * It can't answer "which version did I agree to", "when", or "was that even me". An ecosystem whose
 * premise is that agreements define rights cannot leave its own agreements unrecorded.
 *
 * A record pins three things:
 *   • the DOCUMENT, by sha256 of its exact text — so a later edit can be detected rather than
 *     silently rewriting what the member accepted;
 *   • the TIME, as an ISO timestamp;
 *   • the MEMBER, by an ed25519 signature over a canonical statement of all of the above.
 *
 * **Append-only.** A new version appends a record; it never replaces one. Nothing is removed, ever
 * — an agreement you're no longer under is still an agreement you were once under.
 *
 * ## Why a record can be unsigned
 *
 * The first-run gate is shown BEFORE any wallet exists, so the most important acceptance is the one
 * we can't sign at the time. Refusing to record it until a key exists would lose it entirely, and
 * blocking the gate on wallet creation would be backwards. So a record is written either way, and
 * `signPending` attaches signatures later once there's a key to sign with. An unsigned record still
 * pins WHAT and WHEN, which is most of the value; the UI says plainly which it is.
 */
import * as SecureStore from "expo-secure-store";
import { sha256 } from "@noble/hashes/sha2";
import bs58 from "bs58";
import type { Keypair } from "@solana/web3.js";
import { signMessageUtf8 } from "../solana/signMessage";
import { requireReauth } from "../security/reauth";
import { LEGAL_DOCS, LEGAL_VERSION, type LegalDocKey } from "../legal/content";

const STORE_KEY = "agreements.accepted.v1";
const SECURE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface AgreementRecord {
  doc: LegalDocKey;
  title: string;
  version: number;
  /** sha256 of the document text at the moment it was accepted, hex. */
  hash: string;
  acceptedAt: string;
  /** The wallet that signed, base58. Null on a record made before any wallet existed. */
  wallet: string | null;
  /** base58 ed25519 signature over `message`. Null until signed — see the note above. */
  signature: string | null;
  /** The exact text that was signed, kept so the signature stays verifiable by anyone. */
  message: string | null;
}

const hex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

/** sha256 of a document's text, hex. Stable for identical text, different for any edit. */
export function documentHash(body: string): string {
  return hex(sha256(new TextEncoder().encode(body)));
}

/**
 * The exact text signed. Composed HERE and stored verbatim, so a verifier never has to guess how it
 * was assembled — the same discipline access/vault.ts applies to challenge messages, for the same
 * reason: a signature over a message you can't reproduce byte-for-byte proves nothing.
 */
export function acceptanceMessage(r: {
  title: string;
  version: number;
  hash: string;
  acceptedAt: string;
  wallet: string;
}): string {
  return [
    `I accept the XGO ${r.title}.`,
    "",
    `Wallet: ${r.wallet}`,
    `Document: ${r.title}`,
    `Version: ${r.version}`,
    `SHA-256: ${r.hash}`,
    `Accepted At: ${r.acceptedAt}`,
  ].join("\n");
}

async function readAll(): Promise<AgreementRecord[]> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY, SECURE_OPTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AgreementRecord[]) : [];
  } catch {
    return []; // a corrupt store must not block the acceptance gate
  }
}

async function writeAll(records: AgreementRecord[]): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(records), SECURE_OPTS);
}

/** Every acceptance ever recorded, newest first. */
export async function acceptanceHistory(): Promise<AgreementRecord[]> {
  const all = await readAll();
  return [...all].sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt));
}

/**
 * Record acceptance of the documents behind the first-run gate.
 *
 * Never throws and never blocks: this runs from the acceptance gate, and a member who has agreed to
 * the terms must get into the app whether or not the record could be written or signed.
 */
export async function recordAcceptance(
  docs: LegalDocKey[],
  wallet: string | null,
  keypair: Keypair | null
): Promise<void> {
  try {
    const acceptedAt = new Date().toISOString();
    const existing = await readAll();
    const added: AgreementRecord[] = docs.map((doc) => {
      const { title, body } = LEGAL_DOCS[doc];
      const hash = documentHash(body);
      const base = {
        doc,
        title,
        version: LEGAL_VERSION,
        hash,
        acceptedAt,
        wallet,
        signature: null,
        message: null,
      } satisfies AgreementRecord;
      if (!wallet || !keypair) return base;
      const message = acceptanceMessage({ title, version: LEGAL_VERSION, hash, acceptedAt, wallet });
      return { ...base, message, signature: bs58.encode(signMessageUtf8(keypair, message)) };
    });
    await writeAll([...existing, ...added]);
  } catch {
    /* evidence, not a second lock — see the header */
  }
}

/**
 * Attach signatures to records made before a wallet existed.
 *
 * Signs with the CURRENT wallet, and says so by stamping its address — this asserts "this key
 * confirms the acceptance recorded at that time", which is the only honest claim available when the
 * key didn't exist yet. Biometric-gated like every other signing path.
 *
 * Returns how many were signed.
 */
export async function signPending(wallet: string, keypair: Keypair): Promise<number> {
  const all = await readAll();
  const pending = all.filter((r) => !r.signature);
  if (pending.length === 0) return 0;
  if (!(await requireReauth("Sign your agreements"))) return 0;

  const signed = all.map((r) => {
    if (r.signature) return r;
    const message = acceptanceMessage({
      title: r.title,
      version: r.version,
      hash: r.hash,
      acceptedAt: r.acceptedAt,
      wallet,
    });
    return { ...r, wallet, message, signature: bs58.encode(signMessageUtf8(keypair, message)) };
  });
  await writeAll(signed);
  return pending.length;
}
