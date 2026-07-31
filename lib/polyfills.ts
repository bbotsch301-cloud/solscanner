/**
 * Browser Buffer polyfill. @solana/web3.js and wallet-adapter reference the Node
 * `Buffer` global at runtime; the browser doesn't provide one. Import this module
 * FIRST (before any web3/wallet import) so the global is set before it's used.
 */
import { Buffer } from "buffer";

const g = globalThis as unknown as { Buffer?: typeof Buffer };
if (!g.Buffer) g.Buffer = Buffer;
