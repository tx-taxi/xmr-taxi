# Monero transaction activity

The [activity page](https://xmr.tx.taxi/graphs/transactions) counts confirmed, non-miner transactions by UTC hour, day, calendar month, or calendar year. Tables and CSV exports use the same buckets as the chart. Current periods and the initial partial calendar period are marked explicitly. These are transaction counts, not payment counts or inferred wallet activity.

Monero's genesis block has timestamp zero and no non-miner transactions. It remains in the source snapshot, but plotted calendar periods begin with the first dated block in April 2014.

## Source and reproducibility

Counts come from `num_txes` in canonical Monero block headers. They do not use scraped charts or third-party analytics datasets. `scripts/seed-xmr-activity.py` requests every header from genesis through a tip with 60 confirmations, checking consecutive heights, parent hashes, and orphan status before adding each block once.

Generate a replacement seed using a synced daemon you operate:

```sh
python3 scripts/seed-xmr-activity.py http://127.0.0.1:18089 backend/src/api/monero/data/activity-seed.json.gz
```

The seed included in this release was generated on 2026-09-27 from the deployment's synced Monero daemon:

- Heights: 0 through 3,771,839 inclusive (3,771,840 blocks).
- Anchor hash: `c7f7e0d7c95c8023aa7bfc55803e8dfa2276de3fad277f36986d03750adfa96c`.
- Non-miner transactions: 64,201,403.
- SHA-256 of the gzip file: `33fcd11c696672abb92da120e4318f7d03633f9af757f45a8e6190c0748b83f8`.

The seed is copied into the backend build. The backend catches up automatically, refreshes every minute, and keeps the latest 60 blocks separate so normal reorganizations replace that tail. Each refresh validates the saved anchor and all new parent links. A deeper anchor mismatch resets the index to the bundled seed; a seed anchor mismatch stops updates and is logged.

An incremental snapshot is saved atomically to `XMR_INDEX_DIR/activity-index.json`. Persist that directory to preserve catch-up work across container replacement; without persistence, a fresh deployment catches up again from the bundled seed. The endpoint reports its indexed height, timestamp and freshness, and the page labels delayed refreshes rather than presenting stale data as live.

## API

`GET /api/v1/transaction-activity?interval=day&range=90d`

- Intervals: `hour`, `day`, `month`, `year`.
- Ranges: `24h`, `7d`, `30d`, `90d`, `1y`, `all`; hourly responses are limited to 90 days.
- Buckets contain the UTC period start, transaction count, block count, and a partial-period flag. Empty periods remain present with zero counts.
- Totals cover all history and the day, month and year containing the latest indexed block. Selected ranges include the entire starting calendar bucket.

## Verification for this release

Observed locally: all-history counts matched the independent daemon `get_info.tx_count` exactly at height 3,771,907 (64,204,078 transactions). Calendar aggregation tests cover year boundaries, leap-year months and empty hours. Browser checks cover all four interval controls, table rendering, CSV export and mobile layout. These checks verify this implementation; they do not imply an audit of unrelated explorer statistics.
