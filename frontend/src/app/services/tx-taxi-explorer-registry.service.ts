import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { StateService } from '@app/services/state.service';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';

type ExplorerStatus = 'live' | 'unavailable' | 'checking';

interface RouterBrandAsset {
  url: string;
  alt: string;
}

interface RouterExplorerSite {
  origin: string;
  host: string;
  switcherLogo?: RouterBrandAsset;
}

interface RouterChain {
  id: string;
  name: string;
  nativeSymbol: string;
  displayOrder: number;
  site?: RouterExplorerSite;
}

interface RouterChainsResponse {
  chains: RouterChain[];
}

interface RouterHealthSnapshot {
  chainId: string;
  baseUrl: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  latencyMs?: number;
}

interface RouterHealthResponse {
  explorers: RouterHealthSnapshot[];
}

export interface TxTaxiExplorer {
  chainId: string;
  name: string;
  symbol: string;
  origin: string;
  host: string;
  iconUrl: string;
  iconAlt: string;
  status: ExplorerStatus;
  statusLabel: string;
  statusTitle: string;
}

@Injectable({
  providedIn: 'root',
})
export class TxTaxiExplorerRegistryService {
  readonly explorers$: Observable<TxTaxiExplorer[]>;

  private readonly routerOrigin: string;

  constructor(
    private http: HttpClient,
    private stateService: StateService,
  ) {
    this.routerOrigin = (this.stateService.env.TX_TAXI_ROUTER_URL || 'https://tx.taxi').replace(/\/$/, '');
    this.explorers$ = this.http.get<RouterChainsResponse>(`${this.routerOrigin}/api/v1/chains`).pipe(
      map((response) => response.chains.filter((chain) => this.isFirstPartyExplorer(chain))),
      switchMap((chains) => this.http.get<RouterHealthResponse>(`${this.routerOrigin}/api/v1/health`).pipe(
        map((health) => this.toExplorers(chains, health.explorers)),
        catchError(() => of(this.toExplorers(chains, []))),
      )),
      catchError(() => of([])),
      shareReplay(1),
    );
  }

  private isFirstPartyExplorer(chain: RouterChain): boolean {
    return Boolean(
      chain.site?.host?.endsWith('.tx.taxi')
      && chain.site.switcherLogo?.url
      && chain.site.switcherLogo?.alt,
    );
  }

  private toExplorers(chains: RouterChain[], healthSnapshots: RouterHealthSnapshot[]): TxTaxiExplorer[] {
    return chains
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((chain) => {
        const site = chain.site!;
        const logo = site.switcherLogo!;
        const health = healthSnapshots.find((snapshot) =>
          snapshot.chainId === chain.id && this.sameOrigin(snapshot.baseUrl, site.origin),
        ) ?? healthSnapshots.find((snapshot) => snapshot.chainId === chain.id);
        const status = this.statusFor(health);
        const latency = health?.latencyMs ? `, ${Math.round(health.latencyMs)} ms` : '';

        return {
          chainId: chain.id,
          name: chain.name,
          symbol: chain.nativeSymbol,
          origin: site.origin,
          host: site.host,
          iconUrl: logo.url,
          iconAlt: logo.alt,
          status,
          statusLabel: status === 'live' ? 'Live' : status === 'unavailable' ? 'Unavailable' : 'Checking',
          statusTitle: status === 'live' ? `Live${latency}` : status === 'unavailable' ? 'Unavailable' : 'Status is being checked',
        };
      });
  }

  private statusFor(health?: RouterHealthSnapshot): ExplorerStatus {
    if (health?.status === 'healthy') {
      return 'live';
    }
    if (health?.status === 'unhealthy') {
      return 'unavailable';
    }
    return 'checking';
  }

  private sameOrigin(left: string, right: string): boolean {
    return left.replace(/\/$/, '') === right.replace(/\/$/, '');
  }
}
