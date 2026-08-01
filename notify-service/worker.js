/**
 * Reference push-notification worker (Cloudflare Workers style; adapt freely to Node/Vercel).
 * Two routes:
 *   POST /register  { token, addresses[] }  → store mapping + subscribe addresses to Helius
 *   POST /hook      Helius (or Alchemy) webhook → detect inflows → Expo Push to the recipient's tokens
 *
 * Bindings/secrets expected on `env`:
 *   STORE            KV-like { get(key):Promise<string|null>, put(key,val):Promise<void> }
 *   HELIUS_API_KEY   Helius API key
 *   HELIUS_WEBHOOK_ID  id of a pre-created Helius webhook (addresses get added to it on register)
 *   WEBHOOK_SECRET   shared secret Helius includes on webhook calls (Authorization header)
 *
 * This is a starting point — add auth/rate-limiting, signature verification, and dedupe for prod.
 */

const EXPO_PUSH = "https://exp.host/--/api/v2/push/send";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/register") return register(request, env);
    if (request.method === "POST" && url.pathname === "/hook") return hook(request, env);
    return new Response("ok");
  },
};

// ---- registration -----------------------------------------------------------

async function register(request, env) {
  const { token, addresses } = await request.json().catch(() => ({}));
  if (!token || !Array.isArray(addresses) || addresses.length === 0) {
    return json({ error: "token and addresses[] required" }, 400);
  }
  // token → addresses (for cleanup) and each address → set of tokens (for fast lookup on a hook).
  await env.STORE.put(`tok:${token}`, JSON.stringify(addresses));
  for (const addr of addresses) {
    const key = `addr:${addr}`;
    const set = new Set(JSON.parse((await env.STORE.get(key)) || "[]"));
    set.add(token);
    await env.STORE.put(key, JSON.stringify([...set]));
  }
  await addToHeliusWebhook(env, addresses).catch(() => {});
  return json({ ok: true });
}

async function addToHeliusWebhook(env, addresses) {
  // Fetch the current webhook, union in the new addresses, PUT it back.
  const base = `https://api.helius.xyz/v0/webhooks/${env.HELIUS_WEBHOOK_ID}?api-key=${env.HELIUS_API_KEY}`;
  const cur = await (await fetch(base)).json();
  const merged = [...new Set([...(cur.accountAddresses || []), ...addresses])];
  await fetch(base, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...cur, accountAddresses: merged }),
  });
}

// ---- webhook → push ---------------------------------------------------------

async function hook(request, env) {
  if (env.WEBHOOK_SECRET && request.headers.get("authorization") !== env.WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const events = await request.json().catch(() => []);
  for (const ev of Array.isArray(events) ? events : [events]) {
    // Helius "enhanced" tx: nativeTransfers[] and tokenTransfers[] carry {fromUserAccount,
    // toUserAccount, amount / tokenAmount, mint}. A transfer whose `toUserAccount` is watched = a receipt.
    const receipts = [];
    for (const t of ev.nativeTransfers || []) {
      if (await isWatched(env, t.toUserAccount)) {
        receipts.push({ addr: t.toUserAccount, symbol: "SOL", amount: (t.amount || 0) / 1e9 });
      }
    }
    for (const t of ev.tokenTransfers || []) {
      if (await isWatched(env, t.toUserAccount)) {
        receipts.push({ addr: t.toUserAccount, symbol: shortMint(t.mint), amount: t.tokenAmount || 0 });
      }
    }
    for (const r of receipts) {
      if (r.amount > 0) await pushToAddress(env, r.addr, `Received ${trim(r.amount)} ${r.symbol}`);
    }
  }
  return json({ ok: true });
}

async function isWatched(env, addr) {
  if (!addr) return false;
  return !!(await env.STORE.get(`addr:${addr}`));
}

async function pushToAddress(env, addr, body) {
  const tokens = JSON.parse((await env.STORE.get(`addr:${addr}`)) || "[]");
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({ to, title: "Received", body, sound: "default" }));
  await fetch(EXPO_PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  }).catch(() => {});
  // TODO: read the response and drop tokens that return DeviceNotRegistered.
}

// ---- helpers ----------------------------------------------------------------

const shortMint = (m) => (m ? `${String(m).slice(0, 4)}…` : "tokens");
const trim = (n) => (n < 0.0001 ? Number(n).toPrecision(2) : Number(n).toLocaleString("en-US", { maximumFractionDigits: 6 }));
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
