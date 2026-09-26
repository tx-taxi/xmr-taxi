<p align="center">
  <img src="frontend/src/resources/branding/xmr-favicon.svg" width="88" height="88" alt="xmr.tx.taxi logo">
</p>

<h1 align="center">Monero Explorer · xmr.tx.taxi</h1>

<p align="center">
  A Monero block explorer and mempool visualizer for public chain data.<br>
  <a href="https://xmr.tx.taxi">Open xmr.tx.taxi</a>
</p>

## Overview

[xmr.tx.taxi](https://xmr.tx.taxi) is a Monero explorer in the [tx.taxi](https://tx.taxi) network. It presents public Monero chain and daemon data while preserving the limits of Monero privacy: RingCT hides output amounts, and stealth addresses hide recipients. The explorer does not create public address, wallet, or spend-history claims.

## Features

- Search and inspect Monero blocks, transactions, and observed mempool activity.
- View transaction status, fee, size or weight, confirmations, public ring metadata, and RingCT flags. Recipient addresses and output amounts remain hidden.
- Follow fee estimates, projected pending blocks, every-block difficulty adjustment, difficulty-derived hashrate, and mining history.
- Use the in-app public REST documentation for chain, transaction, mempool, and mining routes.
- Verify a shareable `tx_proof` through an optional `monero-wallet-rpc` service. Check receipt with a private view key or `tx_secret_key` in the browser: these secret values are never sent to the backend, placed in URLs, or stored in browser storage. A private-view-key-only scan cannot verify a subaddress; use the `tx_secret_key` check for subaddress payments.

## Development

Use the Node version in [`.nvmrc`](.nvmrc). The backend requires access to a synced Monero daemon's JSON-RPC endpoint. `MONEROD_RPC_URL` may point to a local restricted daemon or another endpoint you operate; configure credentials with `MONEROD_RPC_USER` and `MONEROD_RPC_PASSWORD` when required. Optional ordered failover endpoints use `MONEROD_RPC_FALLBACK_URLS`. `monero-wallet-rpc` is only required for server-side public `tx_proof` verification, configured with `MONERO_WALLET_RPC_URL` and optional credentials.

Start the backend from one terminal:

```bash
cd backend
npm ci
npm run build
MONEROD_RPC_URL=http://127.0.0.1:18081 npm run start
```

Start the frontend from another terminal:

```bash
cd frontend
npm ci
npm run start
```

Open <http://localhost:4200>. The local Angular configuration proxies `/api` and `/api/v1` to `http://localhost:8999`; the backend defaults to that port and binds to `127.0.0.1` unless `XMR_HOST` or `XMR_PORT` is set. `npm run build` in either `frontend/` or `backend/` runs that package's production build. The frontend requires the backend and its configured daemon for live explorer data. Docker configuration and additional environment details are in [`docker/README.md`](docker/README.md) and [`.env.sample`](.env.sample).

## Attribution and license

This repository adapts the [Mempool Open Source Project](https://github.com/mempool/mempool) for Monero in the tx.taxi network. The prior root documentation is retained in [UPSTREAM_README.md](UPSTREAM_README.md) as an archive of inherited and superseded guidance.

The code is distributed under the terms in [LICENSE](LICENSE) and [COPYING.md](COPYING.md), including the GNU Affero General Public License v3 text and applicable trademark notices.

## Links

- [Live explorer](https://xmr.tx.taxi)
- [tx.taxi hub](https://tx.taxi)
- [Telegram channel](https://t.me/txtaxi)
