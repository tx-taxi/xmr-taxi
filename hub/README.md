# Actual native XMR strip export

Source baseline `76f9a6e59`; strip unchanged from approved palette revision `f6a451f85`. See source-reconciliation.md. Original explorer source files remain byte-identical to the baseline. Only hub/ is added in this isolated worktree.

Build with the existing frontend dependencies installed:

```sh
node hub/build.cjs /home/lukee/dev/tx-taxi-router-hub/public/assets/native-strips/xmr
```

The local checkout reuses the installed frontend node_modules from the approved XMR row-actions worktree. A fresh checkout can install frontend/package-lock.json first. Existing esbuild, TypeScript and Sass compile the actual native components/templates/styles; no AppModule/dashboard/detail application is bundled. `source.json` pins the approved source revision independently of export commits. `provenance.json` hashes original component TypeScript/templates/SCSS, native global styles, helper sources and chain-owned feed.

The contract matches the BTC/ETH export:

```js
const handle = await mount(host, {destination:'https://xmr.tx.taxi'});
const stop = startFeed({onSnapshot: data=>handle.update(data), onStatus, signal});
// On removal or pagehide:
stop(); handle.destroy();
```

Snapshots use native newest-first blocks, one block update, mempoolBlocks and difficultyAdjustment. Chain-owned feed subscribes to `wss://xmr.tx.taxi/api/v1/ws`, validates native messages and reverses oldest-first initial blocks exactly like native StateService. Deadlines, isolated retries, stale/offline state and cleanup match the existing adapter contract. XMR uses its actual fee/amount/weight helpers and xmr amount preference.

Each mount has its own injector, stream state, destination and ShadowRoot. The native CSS/style host stays inside the shadow. The DOCUMENT facade routes native body tooltip portals to a scoped overlay while preserving native transitions and the shared render scheduler. Per-image src resolution preserves native fallback icons without modifying global browser prototypes. Original pending/mined geometry and divider interactions are preserved. The wrapper implements native scroll-offset deltas so fractional mobile rounding matches the explorer.

Controlled desktop1440/mobile390 snapshots and actually opened side-by-side comparisons are in router review/xmr-native/. Both used the same recorded websocket snapshot and clock. Root hub runtime owns aggregate review. No deployment or push.
