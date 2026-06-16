# Fixtures

Saved Helius responses (normalized) used for offline development and unit tests.

Populate by running the data-layer verification against real addresses with a
Helius key set:

```bash
HELIUS_API_KEY=xxxx npx tsx scripts/verify-data-layer.ts [wallet] [mint]
```

This writes `balances.json`, `transfers.json`, and `holders.json` here.
