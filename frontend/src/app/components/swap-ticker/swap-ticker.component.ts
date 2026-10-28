import { ChangeDetectionStrategy, Component, OnInit } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { SeoService } from '@app/services/seo.service';
import { ApiService, XmrSwapMarket, XmrSwapTicker, XmrSwapTrade } from '@app/services/api.service';
import { Observable, combineLatest, concat, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

type SwapTickerPeriod = '24h' | '7d';
type SwapGoggleMode = 'all' | 'btc' | 'fiat' | 'crypto' | 'movers' | 'volume';

interface SwapTickerState {
  loading: boolean;
  ticker: XmrSwapTicker | null;
  error: string;
  activeGoggle: SwapGoggleMode;
  filteredMarkets: XmrSwapMarket[];
  filteredTrades: XmrSwapTrade[];
  goggleCounts: Record<SwapGoggleMode, number>;
  visibleVolume: number;
}

interface SwapTickerBaseState {
  loading: boolean;
  ticker: XmrSwapTicker | null;
  error: string;
}

interface SwapGoggleOption {
  mode: SwapGoggleMode;
  label: string;
}

@Component({
  selector: 'app-swap-ticker',
  templateUrl: './swap-ticker.component.html',
  styleUrls: ['./swap-ticker.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false,
})
export class SwapTickerComponent implements OnInit {
  readonly noUpstreamTrades = $localize`:@@xmr.swap.noUpstreamTrades:No recent trades returned by the upstream market source.`;
  readonly noFilteredTrades = $localize`:@@xmr.swap.noFilteredTrades:No recent trades match this goggle.`;
  radioGroupForm: UntypedFormGroup;
  tickerState$: Observable<SwapTickerState>;
  readonly goggleOptions: SwapGoggleOption[] = [
    { mode: 'all', label: $localize`:@@xmr.swap.all:All` },
    { mode: 'btc', label: 'XMR/BTC' },
    { mode: 'fiat', label: 'Fiat' },
    { mode: 'crypto', label: $localize`:@@xmr.swap.crypto:Crypto` },
    { mode: 'movers', label: $localize`:@@xmr.swap.movers:Movers` },
    { mode: 'volume', label: $localize`:@@xmr.swap.optionVolume:Volume` },
  ];
  private readonly fiatCounters = new Set([
    'ARS', 'AUD', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'CZK', 'DKK', 'EUR',
    'GBP', 'HKD', 'INR', 'JPY', 'MXN', 'NOK', 'NZD', 'PLN', 'SEK', 'SGD',
    'TRY', 'USD', 'ZAR',
  ]);

  constructor(
    private apiService: ApiService,
    private formBuilder: UntypedFormBuilder,
    private seoService: SeoService,
  ) {
    this.radioGroupForm = this.formBuilder.group({
      period: '24h',
      goggle: 'all',
    });
  }

  ngOnInit(): void {
    this.seoService.setTitle($localize`:@@xmr.swap.metaTitle:Haveno and atomic swap ticker`);
    this.seoService.setDescription($localize`:@@xmr.swap.metaDescription:Track RetoSwap Haveno XMR markets and XMR/BTC atomic-swap maker discovery.`);

    const tickerFetch$ = this.radioGroupForm.get('period').valueChanges.pipe(
      startWith(this.radioGroupForm.controls.period.value),
      switchMap((period: SwapTickerPeriod) => concat(
        of({ loading: true, ticker: null, error: '' }),
        this.apiService.getXmrSwapTicker$(period).pipe(
          map((ticker) => ({ loading: false, ticker, error: '' })),
          catchError((error) => of({
            loading: false,
            ticker: null,
            error: error?.error?.message || error?.message || $localize`:@@xmr.swap.unavailable:Swap ticker is unavailable.`,
          })),
        ),
      )),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    const activeGoggle$ = this.radioGroupForm.get('goggle').valueChanges.pipe(
      startWith(this.radioGroupForm.controls.goggle.value),
    );

    this.tickerState$ = combineLatest([tickerFetch$, activeGoggle$]).pipe(
      map(([state, activeGoggle]: [SwapTickerBaseState, SwapGoggleMode]) => this.applyGoggle(state, activeGoggle)),
    );
  }

  atomicLabel(value: string): string { return value === 'XMR/BTC atomic swaps' ? $localize`:@@xmr.swap.atomicLabel:XMR/BTC atomic swaps` : value; }
  atomicDirection(value: string): string { return value === 'BTC to XMR makers' ? $localize`:@@xmr.swap.atomicDirection:BTC to XMR makers` : value; }
  atomicNote(value: string): string { return value === 'Atomic-swap makers advertise through the eigenwallet public registry and libp2p rendezvous discovery instead of a centralized order-book ticker.' ? $localize`:@@xmr.swap.atomicNote:Atomic-swap makers advertise through the eigenwallet public registry and libp2p rendezvous discovery instead of a centralized order-book ticker.` : value; }

  priceUnit(market: XmrSwapMarket | XmrSwapTrade): string {
    return market.pair.startsWith('XMR_') ? `${market.counterCurrency}/XMR` : `XMR/${market.counterCurrency}`;
  }

  changeClass(market: XmrSwapMarket): string {
    if (market.changePercent > 0) {
      return 'text-success';
    }
    if (market.changePercent < 0) {
      return 'text-danger';
    }
    return 'text-muted';
  }

  trackByPair(_index: number, market: XmrSwapMarket): string {
    return market.pair;
  }

  trackByTrade(index: number, trade: XmrSwapTrade): string {
    return `${trade.pair}-${trade.timestamp}-${index}`;
  }

  paymentMethodLabel(trade: XmrSwapTrade): string {
    return trade.paymentMethod.replace(/_/g, ' ');
  }

  setGoggle(mode: SwapGoggleMode): void {
    this.radioGroupForm.get('goggle').setValue(mode);
  }

  goggleCount(state: SwapTickerState, mode: SwapGoggleMode): number {
    return state.goggleCounts[mode] ?? 0;
  }

  private applyGoggle(state: SwapTickerBaseState, activeGoggle: SwapGoggleMode): SwapTickerState {
    const markets = state.ticker?.markets ?? [];
    const filteredMarkets = this.filterMarkets(markets, activeGoggle);
    const filteredPairSet = new Set(filteredMarkets.map((market) => market.pair));
    const filteredTrades = (state.ticker?.recentTrades ?? [])
      .filter((trade) => this.tradeMatchesGoggle(trade, activeGoggle, filteredPairSet));

    return {
      ...state,
      activeGoggle,
      filteredMarkets,
      filteredTrades,
      goggleCounts: this.countGoggles(markets),
      visibleVolume: filteredMarkets.reduce((total, market) => total + market.xmrVolume, 0),
    };
  }

  private filterMarkets(markets: XmrSwapMarket[], mode: SwapGoggleMode): XmrSwapMarket[] {
    if (mode === 'volume') {
      return this.volumeLeaderMarkets(markets);
    }
    return markets.filter((market) => this.marketMatchesGoggle(market, mode));
  }

  private countGoggles(markets: XmrSwapMarket[]): Record<SwapGoggleMode, number> {
    return {
      all: markets.length,
      btc: markets.filter((market) => this.isBtcMarket(market)).length,
      fiat: markets.filter((market) => this.isFiatMarket(market)).length,
      crypto: markets.filter((market) => this.isCryptoMarket(market)).length,
      movers: markets.filter((market) => this.isMoverMarket(market)).length,
      volume: this.volumeLeaderMarkets(markets).length,
    };
  }

  private marketMatchesGoggle(market: XmrSwapMarket, mode: SwapGoggleMode): boolean {
    switch (mode) {
      case 'btc':
        return this.isBtcMarket(market);
      case 'fiat':
        return this.isFiatMarket(market);
      case 'crypto':
        return this.isCryptoMarket(market);
      case 'movers':
        return this.isMoverMarket(market);
      case 'volume':
        return true;
      default:
        return true;
    }
  }

  private tradeMatchesGoggle(trade: XmrSwapTrade, mode: SwapGoggleMode, visiblePairs: Set<string>): boolean {
    if (mode === 'all') {
      return true;
    }
    if (mode === 'volume' || mode === 'movers') {
      return visiblePairs.has(trade.pair);
    }
    if (mode === 'btc') {
      return this.isBtcMarket(trade);
    }
    if (mode === 'fiat') {
      return this.isFiatMarket(trade);
    }
    return this.isCryptoMarket(trade);
  }

  private volumeLeaderMarkets(markets: XmrSwapMarket[]): XmrSwapMarket[] {
    const activeMarkets = markets
      .filter((market) => market.xmrVolume > 0)
      .sort((a, b) => b.xmrVolume - a.xmrVolume);
    return activeMarkets.slice(0, Math.max(1, Math.ceil(activeMarkets.length * 0.25)));
  }

  private isBtcMarket(market: XmrSwapMarket | XmrSwapTrade): boolean {
    return market.counterCurrency.toUpperCase() === 'BTC' || market.pair.includes('BTC');
  }

  private isFiatMarket(market: XmrSwapMarket | XmrSwapTrade): boolean {
    return this.fiatCounters.has(market.counterCurrency.toUpperCase());
  }

  private isCryptoMarket(market: XmrSwapMarket | XmrSwapTrade): boolean {
    return !this.isBtcMarket(market) && !this.isFiatMarket(market);
  }

  private isMoverMarket(market: XmrSwapMarket): boolean {
    return Math.abs(market.changePercent) >= 5;
  }
}
