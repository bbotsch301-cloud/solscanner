"use client";

import "@/lib/polyfills";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import type { PoolSnapshot } from "@/lib/liquidity/config";

const REMOVE_PCTS = [25, 50, 100];

function fmt(n: number | null | undefined, dp = 4): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}

function usd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function LiquidityPanel() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const owner = publicKey?.toBase58();

  const [snap, setSnap] = useState<PoolSnapshot | null>(null);
  const [loadingSnap, setLoadingSnap] = useState(true);
  const [xgoAmount, setXgoAmount] = useState("");
  const [busy, setBusy] = useState<null | "add" | "remove">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string; sig?: string } | null>(null);

  const refresh = useCallback(async () => {
    setLoadingSnap(true);
    try {
      const res = await fetch(`/api/liquidity${owner ? `?owner=${owner}` : ""}`, {
        cache: "no-store",
      });
      setSnap((await res.json()) as PoolSnapshot);
    } catch {
      setSnap(null);
    } finally {
      setLoadingSnap(false);
    }
  }, [owner]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/liquidity${owner ? `?owner=${owner}` : ""}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as PoolSnapshot;
        if (active) setSnap(data);
      } catch {
        if (active) setSnap(null);
      } finally {
        if (active) setLoadingSnap(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [owner]);

  const signSend = useCallback(
    async (base64: string): Promise<string> => {
      if (!signTransaction) throw new Error("Wallet can't sign transactions.");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const tx = VersionedTransaction.deserialize(bytes);
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      const bh = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, ...bh }, "confirmed");
      return sig;
    },
    [connection, signTransaction]
  );

  const add = useCallback(async () => {
    if (!owner || !xgoAmount) return;
    setBusy("add");
    setMsg(null);
    try {
      const res = await fetch("/api/liquidity/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, xgoAmount, slippageBps: 100 }),
      });
      const data = (await res.json()) as { tx?: string; error?: string };
      if (!res.ok || !data.tx) throw new Error(data.error || "Couldn't build the transaction.");
      const sig = await signSend(data.tx);
      setMsg({ kind: "ok", text: "Liquidity added.", sig });
      setXgoAmount("");
      await refresh();
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }, [owner, xgoAmount, signSend, refresh]);

  const remove = useCallback(
    async (pct: number) => {
      if (!owner) return;
      setBusy("remove");
      setMsg(null);
      try {
        const res = await fetch("/api/liquidity/remove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner, pct }),
        });
        const data = (await res.json()) as { tx?: string; error?: string };
        if (!res.ok || !data.tx) throw new Error(data.error || "Couldn't build the transaction.");
        const sig = await signSend(data.tx);
        setMsg({ kind: "ok", text: `Withdrew ${pct}% of your liquidity.`, sig });
        await refresh();
      } catch (e) {
        setMsg({ kind: "err", text: (e as Error).message });
      } finally {
        setBusy(null);
      }
    },
    [owner, signSend, refresh]
  );

  const notLive = snap && snap.configured === false;
  const hasPosition = !!snap?.position;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-5 bg-neutral-950 px-4 py-8 text-neutral-100">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-amber-300">XGO / SOL Liquidity</h1>
        <p className="text-sm text-neutral-400">
          Provide liquidity to the XGO/SOL pool and earn a share of every swap&apos;s trading
          fees. The same pool the app routes trades through.
        </p>
      </header>

      <div className="self-start">
        <WalletMultiButton />
      </div>

      {/* Pool stats */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Pool
        </h2>
        {loadingSnap ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : notLive ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            The XGO/SOL pool goes live at launch. Come back then to add liquidity.
          </div>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Price" value={`${fmt(snap?.priceSolPerXgo, 8)} SOL / XGO`} />
            <Stat label="TVL" value={usd(snap?.tvlUsd)} />
            <Stat label="XGO reserve" value={fmt(snap?.reserves?.xgo, 0)} />
            <Stat label="SOL reserve" value={fmt(snap?.reserves?.sol, 2)} />
            <Stat label="24h volume" value={usd(snap?.volume24hUsd)} />
            <Stat label="24h fees" value={usd(snap?.fees24hUsd)} />
          </dl>
        )}
      </section>

      {/* Your position */}
      {connected && !notLive && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Your position
          </h2>
          {hasPosition ? (
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <Stat label="Pool share" value={`${fmt(snap?.position?.sharePct, 4)}%`} />
              <Stat label="XGO" value={fmt(snap?.position?.xgo, 2)} />
              <Stat label="SOL" value={fmt(snap?.position?.sol, 4)} />
            </dl>
          ) : (
            <p className="text-sm text-neutral-500">You have no liquidity in this pool yet.</p>
          )}
        </section>
      )}

      {/* Add */}
      {!notLive && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Add liquidity
          </h2>
          <label className="mb-2 block text-xs text-neutral-500">XGO amount</label>
          <input
            value={xgoAmount}
            onChange={(e) => setXgoAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="0.0"
            disabled={!connected || busy != null}
            className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-lg font-semibold outline-none focus:border-amber-400 disabled:opacity-50"
          />
          <p className="mb-3 text-xs text-neutral-500">
            The matching SOL is pulled from your wallet at the current pool ratio (balanced
            deposit). Slippage 1%.
          </p>
          <button
            onClick={add}
            disabled={!connected || !xgoAmount || busy != null}
            className="w-full rounded-lg bg-amber-400 py-2.5 font-bold text-neutral-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy === "add" ? "Confirm in wallet…" : connected ? "Add liquidity" : "Connect a wallet"}
          </button>
        </section>
      )}

      {/* Remove */}
      {connected && hasPosition && !notLive && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Remove liquidity
          </h2>
          <div className="flex gap-2">
            {REMOVE_PCTS.map((pct) => (
              <button
                key={pct}
                onClick={() => remove(pct)}
                disabled={busy != null}
                className="flex-1 rounded-lg border border-neutral-700 py-2.5 text-sm font-semibold transition hover:border-amber-400 hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy === "remove" ? "…" : `${pct}%`}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Result */}
      {msg && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          <p>{msg.text}</p>
          {msg.sig && (
            <a
              href={`https://solscan.io/tx/${msg.sig}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block font-mono text-xs underline opacity-80"
            >
              View on Solscan
            </a>
          )}
        </div>
      )}

      {/* Impermanent-loss disclosure */}
      <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs leading-relaxed text-amber-200/90">
        <p className="mb-1 font-semibold text-amber-300">Before you provide liquidity</p>
        <p>
          Providing liquidity is not the same as holding. If XGO&apos;s price moves relative to
          SOL, the pool rebalances your deposit and you can end up with fewer tokens than if you
          had simply held — this is <strong>impermanent loss</strong>, and it can exceed the fees
          you earn. You keep exposure to both assets and can withdraw any time, but the amount you
          get back depends on the pool ratio at that moment. Only provide what you can afford to
          leave in, and understand you may withdraw less value than you put in. This is not
          financial advice.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono text-neutral-100">{value}</dd>
    </div>
  );
}
