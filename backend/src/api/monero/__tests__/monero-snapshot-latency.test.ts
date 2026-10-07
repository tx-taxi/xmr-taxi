import { EventEmitter } from 'events';
import { MoneroApi } from '../monero-api';
import { IMoneroApi } from '../monero-api.interface';
import { MoneroEventBus } from '../monero-event-bus';
import { MoneroWs } from '../monero-ws';
import { getLatestXmrPrice, XmrApiPrice } from '../xmr-price';
import { XmrBlockAttribution, XmrMinerProofRegistry } from '../xmr-miner-proof-registry';

jest.mock('../xmr-price', () => ({
  ...jest.requireActual('../xmr-price'),
  getLatestXmrPrice: jest.fn(),
}));

jest.mock('../../memory-cache', () => {
  const values = new Map<string, unknown>();
  return {
    get: (type: string, id: string) => values.get(`${type}:${id}`) ?? null,
    set: (type: string, id: string, value: unknown) => { values.set(`${type}:${id}`, value); },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('Monero dashboard loading boundaries', () => {
  it('serves concurrent visitors before optional providers finish, then pushes their enrichment', async () => {
    const price = deferred<XmrApiPrice>();
    const attributions = deferred<Map<string, XmrBlockAttribution>>();
    (getLatestXmrPrice as jest.Mock).mockReturnValue(price.promise);
    let attributionCache = new Map<string, XmrBlockAttribution>();
    const registry = {
      recentAttributions: jest.fn(() => attributions.promise.then((records) => {
        attributionCache = records;
        return records;
      })),
      getCachedAttributionForBlock: (hash: string) => attributionCache.get(hash) ?? null,
    } as unknown as XmrMinerProofRegistry;
    const api = {
      getInfo: jest.fn().mockResolvedValue({ height: 101 }),
      getBlockCount: jest.fn().mockResolvedValue(101),
      getFeeEstimate: jest.fn().mockResolvedValue({ fee: 20_000, fees: [20_000] }),
      getTransactionPool: jest.fn().mockResolvedValue({ transactions: [] }),
      getBlockByHeight: jest.fn(async (height: number) => ({
        block_header: {
          height, hash: height.toString(16).padStart(64, '0'),
          timestamp: 1_800_000_000 + height * 120,
          reward: 600_000_000_000, difficulty: 360_000_000,
          block_size: 120_000, block_weight: 120_000, num_txes: 1,
        },
        tx_hashes: ['a'.repeat(64)], json: '{}',
      })),
      getBlockFeeStats: jest.fn().mockResolvedValue({
        totalFees: 2_000_000, medianFee: 20_000,
        minFee: 20_000, maxFee: 20_000, feeRange: [20_000],
      }),
    } as unknown as MoneroApi;
    const adapter = new MoneroWs(api, new EventEmitter() as unknown as MoneroEventBus, registry);
    const pushed: Array<Record<string, any>> = [];
    const client = { OPEN: 1, readyState: 1, send: (raw: string) => pushed.push(JSON.parse(raw)) };
    (adapter as any).wss = { clients: new Set([client]) };
    let snapshot: Record<string, any> | undefined;
    const first = adapter.buildSnapshot().then((value) => { snapshot = value; return value; });
    const second = adapter.buildSnapshot();
    await nextTurn();

    // Both optional responses are still unresolved. Core block, fee and pending data are ready.
    expect(snapshot?.blocks).toHaveLength(8);
    expect(snapshot?.blocks.at(-1)).toMatchObject({ height: 100, extras: { totalFees: 2_000_000 } });
    expect(snapshot?.mempoolInfo.loaded).toBe(true);
    expect(api.getInfo).toHaveBeenCalledTimes(1);
    expect(api.getBlockByHeight).toHaveBeenCalledTimes(8);
    expect(await second).toEqual(await first);

    const blockHash = (snapshot?.blocks.at(-1).id ?? '') as string;
    price.resolve({ time: 1_800_000_000, USD: 150, EUR: 130, GBP: 110, CAD: 200, CHF: 120, AUD: 220, JPY: 20_000 });
    attributions.resolve(new Map([[blockHash, {
      pool: { id: 1, name: 'P2Pool', slug: 'p2pool', minerNames: ['P2Pool'] },
      source: 'p2pool.observer',
    }]]));
    await nextTurn();

    expect(pushed.find((payload) => payload.conversions)?.conversions.USD).toBe(150);
    const enriched = pushed.find((payload) => payload.blocks)?.blocks;
    expect(enriched).toHaveLength(8);
    expect(enriched.at(-1)).toMatchObject({
      height: 100, extras: { totalFees: 2_000_000, pool: { name: 'P2Pool' } },
    });
  });

  it('shares equal daemon reads and allows a failed read to recover', async () => {
    const api = new MoneroApi({ rpcUrl: 'http://127.0.0.1:1', timeoutMs: 100, requirePrimarySync: false });
    const firstResponse = deferred<IMoneroApi.Block>();
    const rpc = { jsonRpc: jest.fn().mockReturnValueOnce(firstResponse.promise) };
    (api as any).rpc = rpc;
    const first = api.getBlockByHeight(9_990_001);
    const second = api.getBlockByHeight(9_990_001);
    const observed = Promise.allSettled([first, second]);
    expect(rpc.jsonRpc).toHaveBeenCalledTimes(1);
    firstResponse.reject(new Error('temporarily unavailable'));
    expect((await observed).map((result) => result.status)).toEqual(['rejected', 'rejected']);

    const block = { block_header: { height: 9_990_001 } } as IMoneroApi.Block;
    rpc.jsonRpc.mockResolvedValueOnce(block);
    await expect(api.getBlockByHeight(9_990_001)).resolves.toEqual(block);
    await expect(api.getBlockByHeight(9_990_001)).resolves.toEqual(block);
    expect(rpc.jsonRpc).toHaveBeenCalledTimes(2);
  });
});
