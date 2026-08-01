/**
 * Best-effort decoding of dApp requests so the approval screen isn't blind-signing.
 * Conservative: when it can't fully decode, it says so rather than implying the tx is safe.
 */
import { Buffer } from "buffer";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const KNOWN_PROGRAMS: Record<string, string> = {
  [SYSTEM_PROGRAM]: "System (SOL)",
  [TOKEN_PROGRAM_ID.toBase58()]: "Token",
  [TOKEN_2022_PROGRAM_ID.toBase58()]: "Token-2022",
  ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL: "Associated Token",
  ComputeBudget111111111111111111111111111111: "Compute Budget",
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter",
  SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf: "Squads",
};
const short = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;
const nameOf = (id: string) => KNOWN_PROGRAMS[id] ?? short(id);

interface Ix {
  programId?: PublicKey;
  accounts: (PublicKey | undefined)[];
  data: Uint8Array;
}

function instructions(bytes: Uint8Array): Ix[] {
  try {
    const tx = VersionedTransaction.deserialize(bytes);
    const keys = tx.message.staticAccountKeys;
    return tx.message.compiledInstructions.map((ci) => ({
      programId: keys[ci.programIdIndex],
      accounts: ci.accountKeyIndexes.map((i) => keys[i]),
      data: ci.data,
    }));
  } catch {
    const tx = Transaction.from(bytes);
    return tx.instructions.map((ix) => ({
      programId: ix.programId,
      accounts: ix.keys.map((k) => k.pubkey),
      data: Uint8Array.from(ix.data),
    }));
  }
}

/** Summarize a base64 Solana transaction: which programs it touches + any SOL transfer. */
export function summarizeSolanaTx(b64: string): { lines: { label: string; value: string }[]; danger: string } {
  const danger = "This can move funds on Solana. Approve only if you trust this app and recognize what it does.";
  try {
    const ixs = instructions(Uint8Array.from(Buffer.from(b64, "base64")));
    const programs = new Set<string>();
    const transfers: string[] = [];
    for (const ix of ixs) {
      const pid = ix.programId?.toBase58();
      if (!pid) continue;
      programs.add(pid);
      // System transfer: u32 discriminator = 2, then u64 lamports (little-endian).
      if (pid === SYSTEM_PROGRAM && ix.data.length >= 12 && ix.data[0] === 2 && ix.data[1] === 0 && ix.data[2] === 0 && ix.data[3] === 0) {
        let lamports = 0n;
        for (let i = 0; i < 8; i++) lamports |= BigInt(ix.data[4 + i]) << BigInt(8 * i);
        const to = ix.accounts[1]?.toBase58();
        transfers.push(`Send ${Number(lamports) / 1e9} SOL → ${to ? short(to) : "?"}`);
      }
    }
    const lines = [{ label: "Programs", value: [...programs].map(nameOf).join(", ") || "unknown" }];
    for (const t of transfers) lines.push({ label: "Transfer", value: t });
    if (!transfers.length)
      lines.push({ label: "Instructions", value: `${ixs.length} — token/contract calls not fully decoded; review carefully` });
    return { lines, danger };
  } catch {
    return {
      lines: [{ label: "Details", value: "Couldn't decode this transaction — approve only if you fully trust the app." }],
      danger,
    };
  }
}

const MAX_UINT = (1n << 256n) - 1n;

/** Decode EVM calldata: ERC-20 approve/transfer get the spender/recipient + amount; else the selector. */
export function summarizeEvmData(data?: string): { line: { label: string; value: string }; danger: string | null } | null {
  if (!data || data === "0x" || data.length < 10) return null;
  const sel = data.slice(0, 10).toLowerCase();
  const word = (n: number) => data.slice(10 + n * 64, 10 + n * 64 + 64);
  const addr = (w: string) => (w.length === 64 ? `0x${w.slice(24)}` : "0x?");
  const big = (w: string) => {
    try {
      return BigInt(`0x${w || "0"}`);
    } catch {
      return 0n;
    }
  };
  if (sel === "0x095ea7b3") {
    // approve(address spender, uint256 amount)
    const spender = addr(word(0));
    const amt = big(word(1));
    const unlimited = amt >= MAX_UINT / 2n;
    return {
      line: { label: "Approve", value: `${spender} to spend ${unlimited ? "UNLIMITED" : amt.toString()} tokens` },
      danger: `This lets ${spender} move your tokens${unlimited ? " with NO limit" : ""} without another confirmation. Approve only if you trust it.`,
    };
  }
  if (sel === "0xa9059cbb") {
    // transfer(address to, uint256 amount)
    return { line: { label: "Token transfer", value: `→ ${addr(word(0))} · ${big(word(1)).toString()} base units` }, danger: null };
  }
  return { line: { label: "Data", value: `contract call · selector ${sel}` }, danger: "This interacts with a contract and can move your funds." };
}
