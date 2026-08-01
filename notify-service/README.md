# XGO push-notification service (Phase 2)

Delivers "Received X" push notifications **even when the app is closed** and for **all of a
user's accounts** — the tier the in-app Phase 1 (foreground/active-account only) can't do.

The mobile app is already wired for this: with `EXPO_PUBLIC_NOTIFY_API` set to this service's URL,
it registers `{ token, addresses }` on launch and whenever notifications are enabled (see
`mobile/src/ui/notifications.ts` → `registerForBackendPush`, called from
`WalletContext.syncPushRegistration`). No further app changes are needed to go live.

## How it works

```
 device ──register(token, addresses)──▶ this service ──▶ store {token → addresses}
                                                   └──▶ subscribe addresses to a Helius webhook
 on-chain receipt ──Helius webhook──▶ this service ──find recipients & amount──▶ Expo Push ──▶ device
```

- **Solana**: [Helius webhooks](https://docs.helius.dev/webhooks-and-websockets/webhooks) fire on
  ANY transaction touching a watched address — including every SPL/Token-2022 token (pump.fun
  included). That's what gives universal coverage.
- **EVM** (optional): [Alchemy Address Activity webhooks](https://docs.alchemy.com/reference/address-activity-webhook)
  (Ethereum + BSC) → same `/hook` handler shape.
- **Delivery**: Expo Push API (`https://exp.host/--/api/v2/push/send`) — no APNs/FCM keys needed,
  Expo relays to both. The app already returns an Expo push token from `getExpoPushTokenAsync()`
  (requires the app to add an EAS `projectId` to `app.json` → `extra.eas.projectId`).

## Deploy (Cloudflare Workers — simplest; any Node host works too)

1. Create a Helius account, get an API key, and note the webhook secret you'll set below.
2. Provision a KV store for `{ token → addresses }` and `{ address → tokens }` (Workers KV, Redis,
   Postgres — anything). `worker.js` uses a `STORE` binding with `get`/`put`.
3. Set secrets: `HELIUS_API_KEY`, `HELIUS_WEBHOOK_ID` (create one webhook, add addresses to it via
   the Helius API on each register), `WEBHOOK_SECRET` (shared secret Helius signs with).
4. Deploy `worker.js`; point `EXPO_PUBLIC_MAINNET_RPC` at Helius too (you'll already want this).
5. In the app build, set `EXPO_PUBLIC_NOTIFY_API=https://<your-worker>/register` and add the EAS
   `projectId`. Rebuild (dev/EAS). Toggle Notifications on → the app registers automatically.

## Endpoints (`worker.js`)

- `POST /register` — body `{ token, addresses }`. Upserts the token↔addresses mapping and adds the
  addresses to the Helius webhook. Rate-limit this per IP/token in production.
- `POST /hook` — the Helius (or Alchemy) webhook target. Verifies the secret, parses the tx for
  **native/token inflows** to any watched address (reuse the same diff logic as
  `mobile/src/solana/deposits.ts`), looks up the recipient's device token(s), and sends an Expo push.

## Notes / hardening
- Verify the webhook signature/secret before trusting a payload.
- De-dupe by transaction signature (a webhook can retry) before pushing.
- Prune stale Expo tokens when the push API returns `DeviceNotRegistered`.
- Keep the address→token index warm so lookups on a hot webhook are O(1).
- This service never holds keys or funds — it only maps public addresses to push tokens.
