# Restricted Monero RPC compatibility — 2026-10-19

Local implementation, not deployed or pushed. Source ancestor matches GitHub main: `4a4150aa774c7cb3b67f83c30b189d9df9e3b010`. Production Coolify XMR app is `gahlk1fnydcchwlbsitqzqow`, tracking main/HEAD. Existing unrelated worktrees were preserved.

Monero 0.18.5.3's authoritative endpoint map restricts `/get_transaction_pool` while leaving `/get_transaction_pool_hashes` public:
https://github.com/monero-project/monero/blob/v0.18.5.3/src/rpc/core_rpc_server.h#L119-L122

## Changes

- Three-second event polling reads hashes rather than downloading and decoding full transaction objects. Failed or malformed snapshots preserve the preceding hash set; a valid empty snapshot clears it.
- Full-pool reads retain the existing native response contract. HTTP 404/405 trigger the existing fallback sequence without declaring the whole primary unhealthy. Other methods keep using the primary. No capability cooldown was introduced; restored access is picked up on the next call.
- Generic plain RPC response handling is unchanged; only event-bus hash snapshots validate status and contents.
- Startup/failover logs show only origins, without userinfo, paths or query strings. Transport exceptions retain HTTP status without the Axios config or token-bearing URL.
- Runtime-only mnr configuration is private outside this repository. Existing Tari and mony.st fallback order is preserved, mnr appended last. The MoneroSpace primary is unchanged. No credentials belong in source, examples or build arguments.

## Bounded verification

- Backend `npm run tsc`: passed (dependencies reused from the existing primary-node review checkout; no dependency changes).
- 17 tests across RPC failover, restricted-node polling, WebSocket projection/confirmation and snapshot latency: passed.
- Real HTTP fixture: restricted primary refuses full-pool reads; fallback handles the token-prefixed route; hashes continue to use primary. Added/removed deltas, failed snapshot retention and genuine empty-pool clearing verified.
- Final transport failure and fallback warnings do not expose the fixture token or Axios request configuration.
- Live mnr POST: hashes and full-pool endpoints both HTTP 200/OK, initially 41 entries each. Full-pool response reported `Mnr-Verify: hash`; hashes reported `none`. Upstream headers present. This records the relay's verification claim, not independent cryptographic verification by tx.taxi.
- Patched compiled RPC pool with a deliberately unreachable loopback primary: successfully failed over to mnr for both methods, 37 entries each at that later observation, including id_hash, fee, weight, tx_json and receive_time.
- No visual changes, production writes, deployment or source push.

## Reproduce

From `backend/`:

```sh
npm run tsc
./node_modules/.bin/jest --runInBand --coverage=false monero-rpc-pool monero-ws monero-snapshot-latency
```

A subsequent release must ship the redaction changes before adding the tokenized fallback to Coolify runtime `MONEROD_RPC_FALLBACK_URLS`; do not add it to the currently deployed backend, whose startup logs print full fallback URLs. Preserve the current primary and fallback order. Check native pool freshness and live deltas after rollout.

## Conservative scope review

Removed the proposed five-minute capability cooldown, which could delay recovery, and generic non-OK response rejection, which could change public RPC error semantics outside mempool polling. Full transaction reads, projection data, retries, primary sync checks and fallback order remain unchanged. Added coverage for immediate return to the primary after endpoint access recovers. mnr remains private local configuration only, pending any production release.
