import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, Subscription, timer, of } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { EChartsOption } from '@app/graphs/echarts';
import { SeoService } from '@app/services/seo.service';
interface Bucket { timestamp: number; transactions: number; blocks: number; partial: boolean; }
interface Activity { interval: string; range: string; height: number; indexedThrough: number; updatedAt: number; stale: boolean; totals: { all: number; today: number; month: number; year: number }; series: Bucket[]; }
@Component({ selector: 'app-transaction-activity', templateUrl: './transaction-activity.component.html', styleUrls: ['./transaction-activity.component.scss'], standalone: false, changeDetection: ChangeDetectionStrategy.OnPush })
export class TransactionActivityComponent implements OnInit, OnDestroy {
  data: Activity | null = null;
  interval = 'day'; range = '90d'; loading = true; error = false; shown = 20;
  readonly intervals = [{ key: 'hour', label: 'Hour' }, { key: 'day', label: 'Day' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }];
  chartOptions: EChartsOption = {};
  chartInitOptions = { renderer: 'svg' };
  private subscription: Subscription;
  constructor(private http: HttpClient, private route: ActivatedRoute, private router: Router, private cd: ChangeDetectorRef, private seo: SeoService) {}
  get ranges() { return this.interval === 'hour' ? ['24h', '7d', '30d', '90d'] : ['30d', '90d', '1y', 'all']; }
  get rows() { return this.data?.series.slice().reverse().slice(0, this.shown) || []; }
  get selectedTotal() { return this.data?.series.reduce((sum, b) => sum + b.transactions, 0) || 0; }
  ngOnInit(): void {
    this.seo.setTitle('Monero transaction activity');
    this.seo.setDescription('Explore Monero transaction counts by hour, day, month and year, from genesis to the latest indexed block.');
    this.subscription = combineLatest([this.route.queryParamMap, timer(0, 60000)]).pipe(
      tap(([params]) => {
        const interval = params.get('interval') || 'day';
        this.interval = this.intervals.some(i => i.key === interval) ? interval : 'day';
        const range = params.get('range') || (this.interval === 'hour' ? '7d' : this.interval === 'day' ? '90d' : 'all');
        this.range = this.ranges.includes(range) ? range : this.ranges[0];
        this.loading = !this.data || this.data.interval !== this.interval || this.data.range !== this.range;
        this.error = false; this.cd.markForCheck();
      }),
      switchMap(() => this.http.get<Activity>('/api/v1/transaction-activity', { params: { interval: this.interval, range: this.range } }).pipe(catchError(() => of(null)))),
    ).subscribe(data => {
      this.data = data; this.loading = false; this.error = !data;
      if (data) this.renderChart(); this.cd.markForCheck();
    });
  }
  ngOnDestroy(): void { this.subscription?.unsubscribe(); }
  selectInterval(interval: string): void { this.shown = 20; void this.router.navigate([], { relativeTo: this.route, queryParams: { interval, range: interval === 'hour' ? '7d' : interval === 'day' ? '90d' : 'all' } }); }
  selectRange(range: string): void { this.shown = 20; void this.router.navigate([], { relativeTo: this.route, queryParams: { interval: this.interval, range } }); }
  retry(): void { this.selectRange(this.range); window.location.reload(); }
  label(timestamp: number): string {
    const iso = new Date(timestamp * 1000).toISOString();
    return this.interval === 'year' ? iso.slice(0, 4) : this.interval === 'month' ? iso.slice(0, 7) : this.interval === 'hour' ? iso.slice(0, 16).replace('T', ' ') : iso.slice(0, 10);
  }
  private renderChart(): void {
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#ff6600';
    const rows = this.data.series;
    this.chartOptions = {
      animation: false, backgroundColor: 'transparent', grid: { left: 70, right: 20, top: 25, bottom: 85 },
      tooltip: { trigger: 'axis', formatter: (params: any) => {
        const row = rows[params[0].dataIndex];
        return `${this.label(row.timestamp)} UTC${row.partial ? ' · Partial period' : ''}<br/>${row.transactions.toLocaleString()} transactions<br/>${row.blocks.toLocaleString()} blocks`;
      } },
      xAxis: { type: 'category', data: rows.map(b => this.label(b.timestamp)), axisLabel: { color: '#a0a0a0', hideOverlap: true } },
      yAxis: { type: 'value', min: 0, minInterval: 1, axisLabel: { color: '#a0a0a0', formatter: (n: number) => n >= 1000000 ? `${n / 1000000}m` : n >= 1000 ? `${n / 1000}k` : String(n) }, splitLine: { lineStyle: { color: '#88888825' } } },
      dataZoom: [{ type: 'inside', filterMode: 'none' }, { type: 'slider', bottom: 8, height: 24, borderColor: '#88888840', textStyle: { color: '#999' } }],
      series: [{ name: 'Transactions', type: 'bar', itemStyle: { color: primary }, data: rows.map(b => ({ value: b.transactions, itemStyle: { opacity: b.partial ? 0.45 : 1 } })) }],
    };
  }
  download(): void {
    const csv = ['period_utc,transactions,blocks,partial', ...this.data.series.map(b => `${this.label(b.timestamp)},${b.transactions},${b.blocks},${b.partial}`)].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `monero-transactions-${this.interval}-${this.range}.csv`; a.click(); URL.revokeObjectURL(url);
  }
}
