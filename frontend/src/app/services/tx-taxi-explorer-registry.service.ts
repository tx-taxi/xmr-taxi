import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { StateService } from '@app/services/state.service';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, timeout } from 'rxjs/operators';

type ExplorerStatus = 'live' | 'unavailable' | 'checking';

interface RouterBrandAsset {
  url: string;
  alt: string;
}

interface RouterExplorerSite {
  origin: string;
  host: string;
  searchPlaceholder?: string;
  switcherLogo?: RouterBrandAsset;
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
  name: string;
  symbol: string;
  category: string;
  objectType: 'address' | 'tx' | 'block';
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
  redirectUrl?: string;
  elapsedMs: number;
}

export interface TxTaxiExplorer {
  chainId: string;
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

  constructor(
    private http: HttpClient,
    private stateService: StateService,
  ) {
    this.routerOrigin = (this.stateService.env.TX_TAXI_ROUTER_URL || 'https://tx.taxi').replace(/\/$/, '');
    const registry$ = this.http.get<RouterChainsResponse>(`${this.routerOrigin}/api/v1/chains`).pipe(shareReplay(1));
    this.thirdPartyExplorers$ = registry$.pipe(
      map(response => response.chains.sort((a,b)=>a.displayOrder-b.displayOrder).flatMap(chain =>
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

  chainSearchUrl(chainId: string, searchText: string): string {
    return `${this.routerOrigin}/${encodeURIComponent(chainId)}/${encodeURIComponent(searchText)}`;
  }

  routerSearchUrl(searchText: string): string {
    return `${this.routerOrigin}/${encodeURIComponent(searchText)}`;
  }

  searchOptions$(searchText: string, probe = false): Observable<TxTaxiSearchOptions | undefined> {
    const value = searchText.trim();
    if (!value) {
      return of(undefined);
    }

    return this.http.get<RouterSearchOptionsResponse>(`${this.routerOrigin}/api/v1/search-options`, {
      params: probe ? { value, probe: '1' } : { value },
    }).pipe(
      timeout(probe ? 6500 : 900),
      map((response) => ({
        input: response.input,
        normalizedInput: response.normalizedInput,
        phase: response.phase,
        status: response.status,
        candidates: response.candidates.map((candidate) => ({
          ...candidate,
          iconUrl: this.absoluteRouterUrl(candidate.iconUrl),
        })),
        ...(response.resolvedChainId ? { resolvedChainId: response.resolvedChainId } : {}),
        ...(response.redirectUrl ? { redirectUrl: response.redirectUrl } : {}),
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
          accentColor: chain.brand.accentColor,
          searchPlaceholder: site.searchPlaceholder || `Search ${chain.name}`,
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

  private absoluteRouterUrl(url: string): string {
    return url.startsWith('/') ? `${this.routerOrigin}${url}` : url;
  }
}
