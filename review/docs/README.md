# Monero documentation evidence

Reviewed 2026-09-26 against the local Monero route registrations and the
public `https://xmr.tx.taxi` deployment. The documentation intentionally
describes only public chain/node observations; it does not describe address
balances, address histories, UTXOs, RBF/CPFP, Electrum, or wallet RPC.

## Runtime checks

Read-only requests returned these results on 2026-09-26:

| Request | Result | Evidence used in docs |
| --- | --- | --- |
| `GET /api/v1/info` | `200 application/json` | height, difficulty, hashrate, pool count, daemon sync fields |
| `GET /api/v1/fees/recommended` | `200 application/json` | `slow`, `normal`, `fast`, `fastest`, and `quantization_mask` fee fields |
| `GET /api/v1/events` | `200 text/event-stream` | SSE content type and no-transform cache policy; connection intentionally remained open until client timeout |

## Registered API inventory

`backend/src/api/monero/monero.routes.ts` registers the documented REST
surface: `info`, `blocks`, `block`, `tx`, `mempool`, `fees`,
`transaction-times`, `historical-price`, `difficulty-adjustment`, `init-data`,
the public monerod bridge, and public `tx_proof` verification. The route
implementation explicitly returns public transaction fields and marks RingCT
values/recipients as unavailable.

`backend/src/api/monero/xmr-mining.routes.ts` registers the historical
hashrate, block fee/reward, fee-rate, size/weight, difficulty, and best-effort
pool routes documented under Mining data.

`backend/src/api/monero/monero-ws.ts` implements `/api/v1/ws`, with initial
snapshots and `blocks`, `block`, `mempool-blocks`, `mempoolInfo`, `fees`,
`bytesPerSecond`, `transactions`, `da`, and projected-block transaction
messages. It accepts `init`, `ping`, `track-tx`, and `track-mempool-block`.

`backend/src/api/monero/monero-sse.routes.ts` implements `/api/v1/events`,
emitting `snapshot`, `block`, and `mempool-delta` events plus a 25-second
comment heartbeat.

## Protocol semantics sources

The FAQ uses Monero’s official technical documentation for the distinction
between stealth addresses, view-key wallet scanning, RingCT amounts, and
participant transaction proofs. It pairs those semantics with the actual
explorer implementation above rather than documenting generic wallet flows.

- https://www.getmonero.org/resources/moneropedia/stealthaddress.html
- https://www.getmonero.org/resources/moneropedia/ringCT.html
- https://www.getmonero.org/resources/moneropedia/viewkey.html
- https://www.getmonero.org/resources/moneropedia/transaction-proofs.html
