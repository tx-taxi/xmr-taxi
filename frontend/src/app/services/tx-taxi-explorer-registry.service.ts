import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { StateService } from '@app/services/state.service';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap, timeout } from 'rxjs/operators';

type ExplorerStatus = 'live' | 'unavailable' | 'checking';

interface RouterBrandAsset {
  url: string;
  alt: string;
}

interface RouterExplorerDestination {
  id: string;
  name: string;
  origin: string;
  default?: boolean;
  icon?: RouterBrandAsset;
  searchPlaceholder?: string;
  reviewOrigin?: string;
  search: { kind?: 'chain' | 'lightning'; resolvePath: string; params?: Record<string, string> };
}

interface RouterExplorerSite {
  origin: string;
  host: string;
  aliasOrigins?: string[];
  localReviewOrigin?: string;
  searchPlaceholder?: string;
  switcherLogo?: RouterBrandAsset;
  destinations?: RouterExplorerDestination[];
}

interface RouterChainBrand {
  icon: RouterBrandAsset;
  accentColor: string;
}

interface RouterChain {
  id: string;
  name: string;
  nativeSymbol: string;
  displayOrder: number;
  brand: RouterChainBrand;
  site?: RouterExplorerSite;
  explorers: Array<{id:string;name:string;baseUrl:string}>;
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

interface RouterSearchOption {
  chainId: string;
  destinationId?: string;
  destinationName?: string;
  destinationDefault?: boolean;
  name: string;
  symbol: string;
  category: string;
  objectType: 'address' | 'tx' | 'block' | 'node' | 'channel';
  confidence: 'strong' | 'weak' | 'fallback';
  confirmed: boolean;
  firstParty: boolean;
  accentColor: string;
  iconUrl: string;
  iconAlt: string;
  explorerName: string;
  host: string;
  directUrl?: string;
}

interface RouterSearchOptionsResponse {
  input: string;
  normalizedInput: string;
  phase: 'classified' | 'resolved';
  status: 'redirect' | 'choices' | 'aggregate' | 'not_found';
  candidates: RouterSearchOption[];
  resolvedChainId?: string;
  resolvedDestinationId?: string;
  redirectUrl?: string;
  elapsedMs: number;
}

export interface TxTaxiExplorer {
  id: string;
  chainId: string;
  destinationId?: string;
  default?: boolean;
  destinations?: TxTaxiExplorer[];
  name: string;
  symbol: string;
  origin: string;
  host: string;
  accentColor: string;
  searchPlaceholder: string;
  iconUrl: string;
  iconAlt: string;
  status: ExplorerStatus;
  statusLabel: string;
  statusTitle: string;
}

export interface TxTaxiThirdPartyExplorer { id:string; chainId:string; name:string; origin:string; host:string; accentColor:string; iconUrl:string; }

export interface TxTaxiSearchCandidate extends RouterSearchOption {
  iconUrl: string;
}

export interface TxTaxiSearchOptions {
  input: string;
  normalizedInput: string;
  phase: 'classified' | 'resolved';
  status: 'redirect' | 'choices' | 'aggregate' | 'not_found';
  candidates: TxTaxiSearchCandidate[];
  resolvedChainId?: string;
  resolvedDestinationId?: string;
  redirectUrl?: string;
  elapsedMs: number;
}

@Injectable({
  providedIn: 'root',
})
export class TxTaxiExplorerRegistryService {
  readonly explorers$: Observable<TxTaxiExplorer[]>;
  readonly thirdPartyExplorers$: Observable<TxTaxiThirdPartyExplorer[]>;

  private readonly routerOrigin: string;
  get hubUrl(): string { return this.routerOrigin + '/'; }

  navigationUrl(value: string): string {
    if (this.routerOrigin !== 'http://127.0.0.1:4582') return value;
    try {
      const url = new URL(value);
      const destination = this.chains.find(chain => chain.id === 'bitcoin')?.site?.destinations?.find(item => item.id === 'lightning' && item.origin === 'https://lightning.btc.tx.taxi' && item.reviewOrigin === 'http://127.0.0.1:4581');
      return destination && url.origin === destination.origin && !url.username && !url.password
        ? destination.reviewOrigin + url.pathname + url.search + url.hash : value;
    } catch { return value; }
  }

  destinationSearchUrl(chainId: string, destinationId: string, value: string): string | undefined {
    return this.chains.find(chain => chain.id === chainId)?.site?.destinations?.some(item => item.id === destinationId)
      ? this.chainSearchUrl(chainId, value, destinationId) : undefined;
  }
  private chains: RouterChain[] = [];

  constructor(
    private http: HttpClient,
    private stateService: StateService,
  ) {
    this.routerOrigin = (this.stateService.env.TX_TAXI_ROUTER_URL || 'https://tx.taxi').replace(/\/$/, '');
    const registry$ = this.http.get<RouterChainsResponse>(`${this.routerOrigin}/api/v1/chains`).pipe(tap(response => this.chains = response.chains), shareReplay(1));
    this.thirdPartyExplorers$ = registry$.pipe(
      map(response => [...response.chains].sort((a,b)=>a.displayOrder-b.displayOrder).flatMap(chain =>
        (chain.explorers || []).filter(explorer => { const url=new URL(explorer.baseUrl); return url.protocol==='https:' && !url.username && !url.password && url.hostname!=='tx.taxi' && !url.hostname.endsWith('.tx.taxi'); }).map(explorer => ({
          id:chain.id+':'+explorer.id, chainId:chain.id, name:explorer.name, origin:explorer.baseUrl,
          host:new URL(explorer.baseUrl).host, accentColor:chain.brand.accentColor, iconUrl:this.absoluteRouterUrl(chain.brand.icon.url),
        })))), catchError(()=>of([])), shareReplay(1),
    );
    this.explorers$ = registry$.pipe(
      map((response) => response.chains.filter((chain) => this.isFirstPartyExplorer(chain))),
      switchMap((chains) => this.http.get<RouterHealthResponse>(`${this.routerOrigin}/api/v1/health`).pipe(
        map((health) => this.toExplorers(chains, health.explorers)),
        catchError(() => of(this.toExplorers(chains, []))),
      )),
      catchError(() => of([])),
      shareReplay(1),
    );
  }

  chainSearchUrl(chainId: string, searchText: string, destinationId?: string): string {
    return `${this.routerOrigin}/${encodeURIComponent(chainId)}/${encodeURIComponent(searchText)}${destinationId ? `?destination=${encodeURIComponent(destinationId)}` : ''}`;
  }

  routerSearchUrl(searchText: string, sourceChainId?: string): string {
    return `${this.routerOrigin}/${encodeURIComponent(searchText)}${sourceChainId ? `?source=${encodeURIComponent(sourceChainId)}` : ''}`;
  }

  searchOptions$(searchText: string, probe = false, sourceChainId?: string, selectedChainId?: string, destinationId?: string): Observable<TxTaxiSearchOptions | undefined> {
    const value = searchText.trim();
    if (!value) {
      return of(undefined);
    }

    return this.http.get<RouterSearchOptionsResponse>(`${this.routerOrigin}/api/v1/search-options`, {
      params: { value, ...(probe ? { probe: '1' } : {}), ...(sourceChainId ? { source: sourceChainId } : {}), ...(selectedChainId && destinationId ? { chain: selectedChainId, destination: destinationId } : {}) },
    }).pipe(
      timeout(probe ? 6500 : 900),
      map((response) => ({
        input: response.input,
        normalizedInput: response.normalizedInput,
        phase: response.phase,
        status: response.status,
        candidates: response.candidates.map(candidate => {
          const destination = this.chains.find(chain => chain.id === candidate.chainId)?.site?.destinations?.find(item => {
            try { return new URL(candidate.directUrl || `https://${candidate.host}`).origin === new URL(item.origin).origin; }
            catch { return false; }
          });
          return {
            ...candidate,
            ...(destination ? { destinationId: destination.id, destinationName: destination.name, destinationDefault: Boolean(destination.default), host: new URL(destination.origin).host } : {}),
            ...(candidate.directUrl ? { directUrl: this.navigationUrl(candidate.directUrl) } : {}),
            iconUrl: this.absoluteRouterUrl(destination?.icon?.url || candidate.iconUrl),
          };
        }),
        ...(response.resolvedChainId ? { resolvedChainId: response.resolvedChainId } : {}),
        ...(response.resolvedDestinationId ? { resolvedDestinationId: response.resolvedDestinationId } : {}),
        ...(response.redirectUrl ? { redirectUrl: this.navigationUrl(response.redirectUrl) } : {}),
        elapsedMs: response.elapsedMs,
      })),
      catchError(() => of(undefined)),
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
    return [...chains]
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map((chain) => {
        const site = chain.site!;
        const logo = site.switcherLogo!;
        const health = healthSnapshots.find((snapshot) =>
          snapshot.chainId === chain.id && this.sameOrigin(snapshot.baseUrl, site.origin),
        ) ?? healthSnapshots.find((snapshot) => snapshot.chainId === chain.id);
        const status = this.statusFor(health);
        const latency = health?.latencyMs ? `, ${Math.round(health.latencyMs)} ms` : '';

        const explorer: TxTaxiExplorer = {
          id: chain.id,
          chainId: chain.id,
          name: chain.name,
          symbol: chain.nativeSymbol,
          origin: site.origin,
          host: site.host,
          accentColor: chain.brand.accentColor,
          searchPlaceholder: site.searchPlaceholder || `Search ${chain.name}`,
          iconUrl: this.absoluteRouterUrl(logo.url),
          iconAlt: logo.alt,
          status,
          statusLabel: status === 'live' ? 'Live' : status === 'unavailable' ? 'Unavailable' : 'Checking',
          statusTitle: status === 'live' ? `Live${latency}` : status === 'unavailable' ? 'Unavailable' : 'Status is being checked',
        };
        explorer.destinations = (site.destinations || []).filter(destination => {
          try {
            const url = new URL(destination.origin);
            return url.protocol === 'https:' && !url.username && !url.password && url.origin === destination.origin
              && [site.origin, ...(site.aliasOrigins || [])].includes(url.origin);
          } catch { return false; }
        }).map(destination => ({
          ...explorer,
          id: `${chain.id}:${destination.id}`,
          destinationId: destination.id,
          name: destination.name,
          origin: this.navigationUrl(destination.origin),
          host: new URL(destination.origin).host,
          default: destination.default,
          searchPlaceholder: destination.searchPlaceholder || `Search ${chain.name} · ${destination.name}`,
          iconUrl: destination.icon ? this.absoluteRouterUrl(destination.icon.url) : explorer.iconUrl,
          iconAlt: destination.icon?.alt || explorer.iconAlt,
          ...(destination.search.kind === 'lightning' ? { status: 'checking' as const, statusLabel: 'Checking', statusTitle: 'Lightning status is checked independently of Bitcoin' } : {}),
        }));
        return explorer;
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

  private absoluteRouterUrl(url: string): string {
    return url.startsWith('/') ? `${this.routerOrigin}${url}` : url;
  }
}
