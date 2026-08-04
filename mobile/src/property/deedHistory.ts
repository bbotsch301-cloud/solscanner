/**
 * Remembering the deed a member actually read, so a later rewrite can't pass for the original.
 *
 * The issuer keeps the metadata update authority after minting — deliberately, because the publish
 * path authorises on it — which means any deed term can be changed at any time unless the issuer has
 * given that authority up. Canonical §18 is explicit that the deed is *recorded, not frozen*, and
 * that the safeguard is **visibility**: an amendment bumps `Agreement Version`, "which the wallet
 * shows and caches".
 *
 * It showed it. It cached nothing. So a creator could flip `Resale Allowed: Yes` to `No` and the
 * member would simply find Send gone, worded as though it had always read that way — with no
 * evidence anywhere on the device that it hadn't. That is the safeguard being written down and not
 * built, which is the worst of the two states, because the document says it is handled.
 *
 * ## What this does and does not claim
 *
 * The chain's current terms still govern and are still what the deed panel renders. They are what is
 * true. This adds memory, not authority: it can say "this used to read differently, here is how",
 * which is what turns a silent rewrite into a visible one. It cannot prevent the rewrite, and no
 * copy built on this may imply otherwise.
 *
 * Deliberately separate from the collectibles snapshot in `solana/collectibles.ts`. That is a cache
 * — overwritten wholesale on every refresh and discarded after a week — and a record that expires is
 * not a record. This one has no expiry, because the question it answers ("what did I agree to?") has
 * no expiry either.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CLUSTER } from "../solana/connection";
import type { Trait } from "./onchainDeed";

const KEY_PREFIX = "deed.seen.v1:";

const storageKey = (mint: string) => `${KEY_PREFIX}${CLUSTER}:${mint}`;

/**
 * The deed traits the member last read for this mint, or null if they never have.
 *
 * Never throws — a device with unreadable storage should render the deed, not an error. The cost of
 * a failed read is one missed amendment notice, which is strictly better than a screen that won't
 * open.
 */
export async function loadSeenDeed(mint: string): Promise<Trait[] | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(mint));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { traits?: Trait[] };
    return Array.isArray(parsed.traits) ? parsed.traits : null;
  } catch {
    return null;
  }
}

/** Record what the member has now read, becoming the baseline the next visit is compared against. */
export async function recordSeenDeed(mint: string, traits: Trait[], seenAt: number): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey(mint), JSON.stringify({ traits, seenAt }));
  } catch {
    /* best-effort — see loadSeenDeed */
  }
}
