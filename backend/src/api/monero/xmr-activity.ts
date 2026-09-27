import { Application } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { gunzipSync } from 'zlib';
import { MoneroApi } from './monero-api';
import { IMoneroApi } from './monero-api.interface';
import logger from '../../logger';

type Hour = [number, number, number]; // UTC hour, non-miner transaction count, blocks
interface Snapshot { version: number; throughHeight: number; throughHash: string; throughTimestamp: number; generatedAt: number; hours: Hour[]; }
export type ActivityInterval = 'hour' | 'day' | 'month' | 'year';
export function periodStart(timestamp: number, interval: ActivityInterval): number {
  const d = new Date(timestamp * 1000);
  if (interval === 'year') return Date.UTC(d.getUTCFullYear(), 0, 1) / 1000;
  if (interval === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000;
  return Math.floor(timestamp / (interval === 'day' ? 86400 : 3600)) * (interval === 'day' ? 86400 : 3600);
}
export function nextPeriod(start: number, interval: ActivityInterval): number {
  const d = new Date(start * 1000);
  if (interval === 'year') return Date.UTC(d.getUTCFullYear() + 1, 0, 1) / 1000;
  if (interval === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
  return start + (interval === 'day' ? 86400 : 3600);
}
export function aggregateActivity(hours: Hour[], interval: ActivityInterval, from: number, until: number) {
  const buckets = new Map<number, { timestamp: number; transactions: number; blocks: number; partial: boolean }>();
  const start = periodStart(from, interval);
  for (let time = start; time <= until; time = nextPeriod(time, interval)) {
    buckets.set(time, { timestamp: time, transactions: 0, blocks: 0, partial: nextPeriod(time, interval) > until || time < from });
  }
  for (const [time, transactions, blocks] of hours) {
    const bucket = buckets.get(periodStart(time, interval));
    if (bucket) { bucket.transactions += transactions; bucket.blocks += blocks; }
  }
  return [...buckets.values()];
}

/** Every header is counted. The latest 60 blocks are refreshed to accommodate reorganizations. */
export class XmrActivityIndex {
  private hours = new Map<number, Hour>();
  private throughHeight = -1;
  private throughHash = '';
  private throughTimestamp = 0;
  private tail: IMoneroApi.BlockHeader[] = [];
  private syncedAt = 0;
  private syncing = false;
  private ready = false;
  private seed!: Snapshot;
  private readonly file = path.join(process.env.XMR_INDEX_DIR || path.join(os.homedir(), '.xmr-space'), 'activity-index.json');
  constructor(private api: MoneroApi) {}

  public async start(): Promise<void> {
    try {
      this.seed = JSON.parse(gunzipSync(await fs.readFile(path.join(__dirname, 'data', 'activity-seed.json.gz'))).toString());
      let snapshot = this.seed;
      try { const saved = JSON.parse(await fs.readFile(this.file, 'utf8')); if (saved.version === 1 && saved.throughTimestamp && saved.throughHeight >= snapshot.throughHeight) snapshot = saved; } catch { /* first boot */ }
      this.load(snapshot);
      void this.sync();
      setInterval(() => void this.sync(), 60_000).unref();
    } catch (e) { logger.err(`xmr activity startup: ${String(e)}`); }
  }
  private load(snapshot: Snapshot): void {
    this.hours = new Map(snapshot.hours.map(h => [h[0], h]));
    this.throughHeight = snapshot.throughHeight; this.throughHash = snapshot.throughHash; this.throughTimestamp = snapshot.throughTimestamp;
    this.syncedAt = snapshot.generatedAt; this.tail = []; this.ready = true;
  }
  private async sync(): Promise<void> {
    if (this.syncing || !this.ready) return;
    this.syncing = true;
    try {
      const tip = await this.api.getBlockCount() - 1;
      const anchor = (await this.api.getBlockHeadersRange(this.throughHeight, this.throughHeight))[0];
      if (anchor?.hash !== this.throughHash) {
        if (this.throughHeight === this.seed.throughHeight) throw new Error('Seed anchor differs from canonical chain');
        this.load(this.seed); return;
      }
      const confirmedTip = Math.max(this.throughHeight, tip - 60);
      for (let start = this.throughHeight + 1; start <= confirmedTip; start += 1000) {
        const end = Math.min(confirmedTip, start + 999);
        const headers = await this.range(start, end, this.throughHash);
        for (const h of headers) {
          const time = Math.floor(h.timestamp / 3600) * 3600;
          const hour = this.hours.get(time) || [time, 0, 0]; hour[1] += h.num_txes; hour[2]++;
          this.hours.set(time, hour);
        }
        this.throughHeight = end; this.throughHash = headers[headers.length - 1].hash; this.throughTimestamp = headers[headers.length - 1].timestamp;
      }
      this.tail = await this.range(this.throughHeight + 1, tip, this.throughHash);
      this.syncedAt = Math.floor(Date.now() / 1000);
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      await fs.writeFile(this.file + '.tmp', JSON.stringify({ version: 1, throughHeight: this.throughHeight, throughHash: this.throughHash, throughTimestamp: this.throughTimestamp, generatedAt: this.syncedAt, hours: [...this.hours.values()] }));
      await fs.rename(this.file + '.tmp', this.file);
    } catch (e) { logger.warn(`xmr activity refresh: ${String(e)}`); }
    finally { this.syncing = false; }
  }
  private async range(start: number, end: number, previous: string): Promise<IMoneroApi.BlockHeader[]> {
    if (end < start) return [];
    const headers = await this.api.getBlockHeadersRange(start, end);
    if (headers.length !== end - start + 1) throw new Error('Incomplete activity header range');
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      if (h.height !== start + i || h.prev_hash !== previous || h.orphan_status || !Number.isSafeInteger(h.num_txes) || h.num_txes < 0) throw new Error('Non-canonical activity header range');
      previous = h.hash;
    }
    return headers;
  }
  public initRoutes(app: Application): void {
    app.get('/api/v1/transaction-activity', (req, res) => {
      if (!this.ready) { res.status(503).json({ error: 'Transaction history is loading' }); return; }
      const interval = String(req.query.interval || 'day') as ActivityInterval;
      const ranges: Record<string, number> = { '24h': 86400, '7d': 7 * 86400, '30d': 30 * 86400, '90d': 90 * 86400, '1y': 366 * 86400, all: Infinity };
      const range = String(req.query.range || (interval === 'hour' ? '7d' : 'all'));
      if (!['hour', 'day', 'month', 'year'].includes(interval) || !(range in ranges)) { res.status(400).json({ error: 'Invalid interval or range' }); return; }
      if (interval === 'hour' && !['24h', '7d', '30d', '90d'].includes(range)) { res.status(400).json({ error: 'Hourly view supports up to 90 days' }); return; }
      const hours: Hour[] = [...this.hours.values()].map(h => [...h] as Hour);
      for (const h of this.tail.filter(h => h.height > this.throughHeight)) hours.push([Math.floor(h.timestamp / 3600) * 3600, h.num_txes, 1]);
      const times = hours.map(h => h[0]);
      // Monero's genesis timestamp is zero, not a historical activity date.
      // Its transaction count is zero; retain it in the seed but start charts in 2014.
      const first = times.reduce((a, b) => b > 0 ? Math.min(a, b) : a, Infinity);
      const recent = this.tail.filter(h => h.height > this.throughHeight);
      const asOf = recent.at(-1)?.timestamp ?? this.throughTimestamp;
      const from = range === 'all' ? first : Math.max(first, periodStart(asOf - ranges[range], interval));
      const series = aggregateActivity(hours, interval, from, asOf);
      const total = (start: number) => hours.filter(h => h[0] >= start).reduce((sum, h) => sum + h[1], 0);
      res.json({ interval, range, timezone: 'UTC', excludesCoinbase: true, source: 'Monero canonical block headers',
        indexedFrom: first, indexedThrough: asOf, height: recent.at(-1)?.height ?? this.throughHeight,
        updatedAt: this.syncedAt, stale: Date.now() / 1000 - this.syncedAt > 600,
        totals: { all: total(first), today: total(periodStart(asOf, 'day')), month: total(periodStart(asOf, 'month')), year: total(periodStart(asOf, 'year')) }, series });
    });
  }
}
