const mockMemoryCache = {
  data: new Map<string, unknown>(),
  get<T>(type: string, id: string): T | null {
    const key = `${type}:${id}`;
    return this.data.has(key) ? this.data.get(key) as T : null;
  },
  set(type: string, id: string, data: unknown): void {
    this.data.set(`${type}:${id}`, data);
  },
  clear(): void {
    this.data.clear();
  },
};

jest.mock('../../memory-cache', () => ({
  __esModule: true,
  default: mockMemoryCache,
}));

import {
  getXmrPriceConversion,
  getLatestXmrPrice,
  isFreshXmrPrice,
  setXmrPriceStoreForTests,
  XmrApiPrice,
  XmrPriceStore,
} from '../xmr-price';

const HOUR_SECONDS = 3600;

function bucket(time: number): number {
  return Math.floor(time / HOUR_SECONDS) * HOUR_SECONDS;
}

function price(time: number, value: number): XmrApiPrice {
  return {
    time,
    USD: value,
    EUR: value * 0.9,
    GBP: value * 0.8,
    CAD: value * 1.35,
    CHF: value * 0.88,
    AUD: value * 1.5,
    JPY: value * 150,
  };
}

function response(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

class MemoryXmrPriceStore implements XmrPriceStore {
  public saved: XmrApiPrice[] = [];

  constructor(private prices: XmrApiPrice[] = []) {}

  public describe(): string {
    return 'memory';
  }

  public async loadAll(): Promise<XmrApiPrice[]> {
    return [...this.prices].sort((a, b) => a.time - b.time);
  }

  public async findNearest(timestamp: number, toleranceSeconds: number): Promise<XmrApiPrice | null> {
    const best = this.prices.reduce<XmrApiPrice | null>((closest, candidate) => {
      if (!closest || Math.abs(candidate.time - timestamp) < Math.abs(closest.time - timestamp)) {
        return candidate;
      }
      return closest;
    }, null);
    return best && Math.abs(best.time - timestamp) <= toleranceSeconds ? best : null;
  }

  public async saveMany(prices: XmrApiPrice[]): Promise<void> {
    this.saved.push(...prices);
    const byTime = new Map<number, XmrApiPrice>();
    for (const item of this.prices.concat(prices)) {
      byTime.set(item.time, item);
    }
    this.prices = [...byTime.values()].sort((a, b) => a.time - b.time);
  }
}

describe('XMR price history', () => {
  const originalFetch = global.fetch;
  const originalBackfill = process.env.XMR_PRICE_BACKFILL_ON_DEMAND;
  let dateNow: jest.SpyInstance<number, []>;

  beforeEach(() => {
    mockMemoryCache.clear();
    process.env.XMR_PRICE_BACKFILL_ON_DEMAND = 'false';
    dateNow = jest.spyOn(Date, 'now').mockReturnValue(1_700_100_000_000);
  });

  afterEach(() => {
    setXmrPriceStoreForTests(null);
    global.fetch = originalFetch;
    dateNow.mockRestore();
    if (originalBackfill === undefined) {
      delete process.env.XMR_PRICE_BACKFILL_ON_DEMAND;
    } else {
      process.env.XMR_PRICE_BACKFILL_ON_DEMAND = originalBackfill;
    }
  });

  it('returns the stored series plus the latest sampled XMR price', async () => {
    const store = new MemoryXmrPriceStore([
      price(1_700_000_000, 140),
      price(1_700_003_600, 145),
    ]);
    setXmrPriceStoreForTests(store);
    global.fetch = jest.fn().mockResolvedValue(response({
      monero: {
        usd: 155,
        eur: 142,
        gbp: 124,
        cad: 209,
        chf: 136,
        aud: 233,
        jpy: 23_250,
        last_updated_at: 1_700_099_900,
      },
    })) as typeof fetch;

    const result = await getXmrPriceConversion();

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/simple/price?ids=monero'), expect.any(Object));
    expect(result.prices.map((item) => item.time)).toEqual([
      bucket(1_700_000_000),
      bucket(1_700_003_600),
      bucket(1_700_099_900),
    ]);
    expect(result.prices[result.prices.length - 1]).toMatchObject({ USD: 155, EUR: 142 });
    expect(result.exchangeRates.USDEUR).toBeCloseTo(142 / 155);
    expect(store.saved[store.saved.length - 1]).toMatchObject({
      time: bucket(1_700_099_900),
      USD: 155,
    });
  });

  it('uses a recent Kraken trade once for concurrent requests and does not store it as history', async () => {
    const store = new MemoryXmrPriceStore();
    setXmrPriceStoreForTests(store);
    global.fetch = jest.fn((url: string) => {
      if (url.includes('coingecko')) return Promise.resolve({ ok: false, status: 429 } as Response);
      if (url.includes('kraken')) return Promise.resolve(response({ error: [], result: { XXMRZUSD: [['598.25', '0.1', 1_700_099_990, 'b', 'l']], last: '1' } }));
      throw new Error('unexpected provider');
    }) as typeof fetch;
    const [a, b] = await Promise.all([getLatestXmrPrice(), getLatestXmrPrice()]);
    expect(a).toMatchObject({ USD: 598.25, EUR: -1, time: 1_700_099_990, source: 'kraken' });
    expect(b).toEqual(a);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(store.saved).toEqual([]);
    expect(isFreshXmrPrice(a)).toBe(true);
    const history = await getXmrPriceConversion(1_700_000_000);
    expect(history.prices[0].USD).toBe(-1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    process.env.XMR_PRICE_BACKFILL_ON_DEMAND = 'true';
    await getXmrPriceConversion();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    dateNow.mockReturnValue(1_700_100_591_000);
    expect(isFreshXmrPrice(a)).toBe(false);
  });

  it('returns unavailable instead of a stale or malformed fallback trade', async () => {
    setXmrPriceStoreForTests(new MemoryXmrPriceStore());
    global.fetch = jest.fn((url: string) => Promise.resolve(url.includes('coingecko')
      ? { ok: false, status: 429 } as Response
      : response({ error: [], result: { XXMRZUSD: [['598', '0.1', 1_700_000_000]] } }))) as typeof fetch;
    const result = await getLatestXmrPrice();
    expect(result.USD).toBe(-1);
    expect(result.EUR).toBe(-1);
    await getLatestXmrPrice();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects CoinGecko quotes with missing, stale or future source timestamps', async () => {
    setXmrPriceStoreForTests(new MemoryXmrPriceStore());
    global.fetch = jest.fn((url: string) => Promise.resolve(url.includes('coingecko')
      ? response({ monero: { usd: 100 } })
      : response({ error: [], result: { XXMRZUSD: [['599', '0.1', 1_700_099_999]] } }))) as typeof fetch;
    const result = await getLatestXmrPrice();
    expect(result).toMatchObject({ USD: 599, source: 'kraken' });
    expect(isFreshXmrPrice({ ...result, time: 1_700_100_031 })).toBe(false);
    expect(isFreshXmrPrice({ ...result, time: 1_700_099_399 })).toBe(false);
  });

  it('retries optional history after a rate-limited backfill recovers', async () => {
    const store = new MemoryXmrPriceStore();
    setXmrPriceStoreForTests(store);
    process.env.XMR_PRICE_BACKFILL_ON_DEMAND = 'true';
    let historyAvailable = false;
    global.fetch = jest.fn((url: string) => {
      if (url.includes('/simple/price')) return Promise.resolve(response({ monero: { usd: 150, last_updated_at: 1_700_099_999 } }));
      if (!historyAvailable && !url.includes('vs_currency=usd')) return Promise.resolve({ ok: false, status: 429 } as Response);
      return Promise.resolve(response({ prices: [[1_700_000_000_000, 140]] }));
    }) as typeof fetch;
    await getXmrPriceConversion();
    expect(global.fetch).toHaveBeenCalledTimes(8);
    expect(store.saved.some(item => item.time === bucket(1_700_000_000) && item.USD === 140)).toBe(true);
    historyAvailable = true;
    mockMemoryCache.data.delete('xmr-price:coingecko-cooldown');
    mockMemoryCache.data.delete('xmr-price-backfill:recent:1095:retry');
    await getXmrPriceConversion();
    expect(global.fetch).toHaveBeenCalledTimes(15);
    expect(store.saved.some(item => item.time === bucket(1_700_000_000))).toBe(true);
  });

  it('uses a stored nearest point for timestamp lookups', async () => {
    const stored = price(1_700_020_000, 150);
    const store = new MemoryXmrPriceStore([stored]);
    setXmrPriceStoreForTests(store);
    global.fetch = jest.fn() as typeof fetch;

    const result = await getXmrPriceConversion(1_700_021_200);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.prices).toEqual([stored]);
    expect(result.exchangeRates.USDEUR).toBeCloseTo(stored.EUR / stored.USD);
  });

  it('fetches and persists a historical point when the local series misses', async () => {
    const store = new MemoryXmrPriceStore();
    setXmrPriceStoreForTests(store);
    const target = 1_700_050_000;
    const values = {
      usd: 160,
      eur: 147,
      gbp: 128,
      cad: 216,
      chf: 141,
      aud: 240,
      jpy: 24_000,
    };
    global.fetch = jest.fn((url: string) => {
      const currency = new URL(url).searchParams.get('vs_currency') as keyof typeof values;
      return Promise.resolve(response({
        prices: [[target * 1000, values[currency]]],
      }));
    }) as typeof fetch;

    const result = await getXmrPriceConversion(target);

    expect(global.fetch).toHaveBeenCalledTimes(7);
    expect(result.prices).toEqual([{
      time: bucket(target),
      USD: 160,
      EUR: 147,
      GBP: 128,
      CAD: 216,
      CHF: 141,
      AUD: 240,
      JPY: 24_000,
    }]);
    expect(store.saved).toEqual(result.prices);
    expect(result.exchangeRates.USDJPY).toBe(150);
  });
});
