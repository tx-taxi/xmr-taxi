import { ReplaySubject } from 'rxjs';

export interface FiatReferenceInfo { asOf: string; stale: boolean; }
interface Quote { asOf: string; stale: boolean; rates: Record<string, number>; }
const DAY = 86400000;
const MAX_AGE = 7 * DAY;
const RETRY = 5 * 60000;
const REFRESH = 60 * 60000;
const DEFAULT_ROUTER = 'https://tx.taxi';

function rateEndpoint(configured: string): string | null {
  try {
    const url = new URL(configured || DEFAULT_ROUTER);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return `${url.origin}/api/v1/fiat-rates`;
  } catch { return null; }
}

/** Supplements only the active currency of current native quotes; historical prices never enter this subject. */
export class FiatReferenceConversions extends ReplaySubject<Record<string, number>> {
  private raw: Record<string, number> | null = null;
  private rateUrl = rateEndpoint(DEFAULT_ROUTER);
  private selected = 'USD';
  private reference: Quote | null = null;
  private inFlight = false;
  private generation = 0;
  private nextAttempt = 0;
  constructor(private enabled: boolean, private report: (info: FiatReferenceInfo | null) => void,
    private get: typeof fetch = (input, init) => fetch(input, init), private now: () => number = Date.now) { super(1); }

  setRouterUrl(url: string): void {
    this.generation++;
    this.inFlight = false;
    this.rateUrl = rateEndpoint(url);
    this.reference = null;
    this.nextAttempt = 0;
    if (this.raw) this.publish();
    this.refreshIfNeeded();
  }

  override next(value: Record<string, number>): void {
    this.raw = value && typeof value === 'object' ? { ...value } : {};
    this.publish();
    this.refreshIfNeeded();
  }

  select(currency: string): void {
    this.selected = currency;
    if (this.raw) this.publish();
    this.refreshIfNeeded();
  }

  private validReference(value: Quote | null): value is Quote {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value.asOf)) return false;
    const date = Date.parse(`${value.asOf}T00:00:00Z`);
    return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value.asOf && date <= this.now() && this.now() - date <= MAX_AGE;
  }
  private positive(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }
  private needsReference(): boolean {
    return this.enabled && !!this.rateUrl && !!this.raw && this.selected !== 'USD' && this.positive(this.raw.USD) && !this.positive(this.raw[this.selected]);
  }
  private publish(): void {
    if (!this.raw) return;
    const output = { ...this.raw };
    if (this.needsReference() && this.validReference(this.reference) && this.positive(this.reference.rates[this.selected])) {
      output[this.selected] = output.USD * this.reference.rates[this.selected];
      this.report({ asOf: this.reference.asOf, stale: this.reference.stale });
    } else this.report(null);
    super.next(output);
  }
  private refreshIfNeeded(): void {
    if (!this.needsReference() || this.inFlight || this.now() < this.nextAttempt) return;
    this.inFlight = true;
    const generation = this.generation;
    this.get(this.rateUrl!, { signal: AbortSignal.timeout(6000), credentials: 'omit' })
      .then(async response => {
        if (generation !== this.generation) return;
        if (!response.ok) throw new Error('Fiat reference rates unavailable');
        const data: { base?: string; asOf?: string; stale?: boolean; rates?: Record<string, number> } = await response.json();
        if (generation !== this.generation) return;
        if (data.base !== 'USD' || typeof data.asOf !== 'string' || typeof data.stale !== 'boolean' || !data.rates || typeof data.rates !== 'object') throw new Error('Invalid fiat rates');
        const quote = { asOf: data.asOf, stale: data.stale, rates: data.rates };
        if (!this.validReference(quote) || !this.positive(quote.rates.USD) || quote.rates.USD !== 1 || !this.positive(quote.rates[this.selected])) throw new Error('Invalid fiat rates');
        if (this.validReference(this.reference) && quote.asOf < this.reference.asOf) throw new Error('Older fiat rates');
        this.reference = quote;
        this.nextAttempt = this.now() + (quote.stale ? RETRY : REFRESH);
      })
      .catch(() => {
        if (generation !== this.generation) return;
        if (this.reference) this.reference = { ...this.reference, stale: true };
        this.nextAttempt = this.now() + RETRY;
      })
      .finally(() => {
        if (generation !== this.generation) return;
        this.inFlight = false;
        this.publish();
      });
  }
}
