# XMR initial-load repair — 2026-10-07

Starting source: production and remote main both `35d1df2b5e9b18f30b5161636d8b0a371cacd8f5`. Kit pin `ea7e0189b` is historical; this change starts from the full current deployed source, preserving all 58 intervening commits, frontend, routing, and other worktrees. Isolated checkout: `/home/lukee/dev/xmr-primary-node-20261007`.

## Before

Root HTML 350 ms and block list 1,409 ms. Initial data returned origin 502 after 32,197 ms; mempool/fees exceeded 15-second deadlines. Two fresh browsers displayed no heights and received no block-bearing frame within 25 seconds. See the baseline JSON files.

## Change

Runtime primary is MoneroSpace's existing public-method RPC proxy, `http://monerospace/api/v1/monerod`, backed by its existing synced restricted monerod on port 18089. Both applications already share the Coolify network and its stable `monerospace` service alias. No new node, public RPC port, MoneroSpace rollout, or network mutation is required.

Runtime fallbacks: `https://xmr-01.tari.com,https://xmr.mony.st`. Each returned real pool, fee estimate, historical block 2000001 and the user-reported XMR transaction, with all measured calls below one second from the production container. Cake and node.xmr.pub returned current info but pool 404 responses, so they are removed from this deployment's fallback list.

Runtime timeout is 3,000 ms per node; sync check is enabled and primary cooldown is 15,000 ms. Pool-managed transports try each node once rather than multiplying timeouts through retries. Health checks, equal daemon reads and simultaneous snapshots share in-flight work. Existing cache TTLs remain intact. Optional price and mining attribution refresh in the background and enrich the stream when available; they do not gate the initial core feed or invent missing values.

## Local verification

Seven transport behavior tests and eight snapshot/live-stream behavior tests passed, covering a truly hanging primary, cooldown/recovery, concurrent health/read coalescing, optional-provider stalls, tracked transactions and ordered updates. Backend TypeScript compilation passed.

`local-live-snapshot.json` is an actual four-client concurrent snapshot through an SSH tunnel to the production MoneroSpace proxy. It completed in 1,069 ms, returned eight ordered fee-bearing blocks and 36 pending transactions, and all four callers shared the same result. Pool observations naturally vary by node/time.

## Deployment

Coolify application: `gahlk1fnydcchwlbsitqzqow` (xmr-taxi-private), Dockerfile, main branch, port 80. Runtime env keys: MONEROD_RPC_URL, MONEROD_RPC_FALLBACK_URLS, MONEROD_RPC_TIMEOUT_MS, MONEROD_RPC_REQUIRE_SYNC, MONEROD_RPC_HEALTH_INTERVAL_MS. The installed CLI uses the unsupported `is_build_time` create field; environment changes use the authenticated Coolify API's `is_buildtime=false`, `is_runtime=true` schema instead. No credentials are committed.

Production post-rollout browser/API/fallback evidence will be recorded here once verified. Source rollback baseline is `35d1df2b5`; runtime primary can be changed independently if needed. Do not claim process health alone proves provider freshness.
