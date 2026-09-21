import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, timer } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { ApiService, XmrBackendHealth, XmrDaemonInfo } from '@app/services/api.service';
import { SeoService } from '@app/services/seo.service';
import { OpenGraphService } from '@app/services/opengraph.service';

type XmrStatusState = 'online' | 'syncing' | 'degraded' | 'offline';

interface CheckResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface XmrStatusSnapshot {
  backend: CheckResult<XmrBackendHealth>;
  daemon: CheckResult<XmrDaemonInfo>;
  checkedAt: number;
  state: XmrStatusState;
}

@Component({
  selector: 'app-xmr-status',
  templateUrl: './xmr-status.component.html',
  styleUrls: ['./xmr-status.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XmrStatusComponent implements OnInit {
  status$: Observable<XmrStatusSnapshot>;

  constructor(
    private apiService: ApiService,
    private seoService: SeoService,
    private ogService: OpenGraphService,
  ) {}

  ngOnInit(): void {
    this.seoService.setTitle('Monero daemon status');
    this.seoService.setDescription('Live xmr.tx.taxi backend and monerod health, sync state, version, peers, and storage status.');
    this.ogService.setManualOgImage('dashboard.png');

    this.status$ = timer(0, 10_000).pipe(
      switchMap(() => this.apiService.getXmrDaemonInfo$().pipe(
        map((data) => {
          const backend: CheckResult<XmrBackendHealth> = {
            ok: true,
            data: { ok: true, service: 'xmr-taxi' },
          };
          const daemon: CheckResult<XmrDaemonInfo> = { ok: !data.offline, data };
          return {
            backend,
            daemon,
            checkedAt: Date.now(),
            state: this.resolveState(backend, daemon),
          };
        }),
        catchError((error) => {
          const message = this.describeError(error);
          const backend: CheckResult<XmrBackendHealth> = { ok: false, error: message };
          const daemon: CheckResult<XmrDaemonInfo> = { ok: false, error: message };
          return of({ backend, daemon, checkedAt: Date.now(), state: 'offline' as XmrStatusState });
        }),
      )),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  resolveState(backend: CheckResult<XmrBackendHealth>, daemon: CheckResult<XmrDaemonInfo>): XmrStatusState {
    if (!daemon.ok || daemon.data?.offline) {
      return 'offline';
    }
    if (!daemon.data?.synced) {
      return 'syncing';
    }
    if (!backend.ok || daemon.data?.untrusted || daemon.data?.update_available) {
      return 'degraded';
    }
    return 'online';
  }

  stateLabel(state: XmrStatusState): string {
    switch (state) {
      case 'online':
        return 'monerod reachable';
      case 'syncing':
        return 'syncing';
      case 'degraded':
        return 'attention needed';
      case 'offline':
        return 'daemon unreachable';
    }
  }

  heightBehind(info: XmrDaemonInfo): number {
    if (!info.target_height || info.target_height <= info.height) {
      return 0;
    }
    return info.target_height - info.height;
  }

  peerCount(info: XmrDaemonInfo): number {
    return (info.incoming_connections_count ?? 0) + (info.outgoing_connections_count ?? 0);
  }

  shortHash(hash?: string): string {
    if (!hash) {
      return 'unknown';
    }
    return hash.length > 18 ? `${hash.slice(0, 10)}...${hash.slice(-8)}` : hash;
  }

  formatNumber(value: number | undefined | null): string {
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'unknown';
  }

  formatHashrate(value: number | undefined | null): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return 'unknown';
    }
    const units = ['H/s', 'kH/s', 'MH/s', 'GH/s', 'TH/s'];
    let scaled = value;
    let unitIndex = 0;
    while (scaled >= 1000 && unitIndex < units.length - 1) {
      scaled /= 1000;
      unitIndex++;
    }
    return `${scaled.toLocaleString(undefined, { maximumFractionDigits: scaled >= 100 ? 0 : 2 })} ${units[unitIndex]}`;
  }

  formatBytes(value: number | undefined | null): string {
    // Restricted public daemons commonly return UINT64_MAX when free-space
    // information is unavailable. Do not present that sentinel as petabytes.
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 2 ** 63) {
      return 'unknown';
    }
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let scaled = value;
    let unitIndex = 0;
    while (scaled >= 1024 && unitIndex < units.length - 1) {
      scaled /= 1024;
      unitIndex++;
    }
    return `${scaled.toLocaleString(undefined, { maximumFractionDigits: unitIndex === 0 ? 0 : 2 })} ${units[unitIndex]}`;
  }

  formatDuration(seconds: number | undefined | null): string {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      return 'unknown';
    }
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  formatTimestamp(epochSeconds: number | undefined | null): string {
    if (typeof epochSeconds !== 'number' || !Number.isFinite(epochSeconds) || epochSeconds <= 0) {
      return 'unknown';
    }
    return new Date(epochSeconds * 1000).toLocaleString();
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status) {
        return `${error.status} ${error.statusText || 'request failed'}`;
      }
      return 'network request failed';
    }
    if (error instanceof Error) {
      return error.message;
    }
    return 'request failed';
  }
}
