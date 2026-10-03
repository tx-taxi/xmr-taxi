import { NgbDropdown } from '@ng-bootstrap/ng-bootstrap';
import { Component, OnInit, ChangeDetectionStrategy, EventEmitter, Output, ViewChild, HostListener, ElementRef, Input } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { EventType, NavigationStart, Router } from '@angular/router';
import { StateService } from '@app/services/state.service';
import { TxTaxiExplorer, TxTaxiExplorerRegistryService, TxTaxiSearchCandidate, TxTaxiSearchOptions } from '@app/services/tx-taxi-explorer-registry.service';
import { BehaviorSubject, combineLatest, Observable, defer, of } from 'rxjs';
import { catchError, debounceTime, finalize, distinctUntilChanged, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { RelativeUrlPipe } from '@app/shared/pipes/relative-url/relative-url.pipe';
import { SearchResultsComponent } from '@components/search-form/search-results/search-results.component';

interface XmrSearchResults {
  searchText: string;
  hashQuickMatch: boolean;
  blockHeight: boolean;
  blockOrTxHash: boolean;
  unsupportedAddress: boolean;
  showDropdown: boolean;
}

interface SearchTarget {
  kind: 'explorer' | 'candidate' | 'router';
  chainId?: string;
  destinationId?: string;
  destinationDefault?: boolean;
  origin?: string;
  candidate?: TxTaxiSearchCandidate;
  name: string;
  accentColor: string;
  iconUrl: string;
  iconAlt: string;
  searchPlaceholder: string;
  confirmed?: boolean;
  directUrl?: string;
}

@Component({
  selector: 'app-search-form',
  templateUrl: './search-form.component.html',
  styleUrls: ['./search-form.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFormComponent implements OnInit {
  @Input() hamburgerOpen = false;
  readonly sourceChainId = 'monero';
  readonly defaultChainIconUrl = 'https://tx.taxi/assets/chains/monero.png';
  readonly defaultChainIconAlt = 'Monero explorer';
  readonly defaultChainAccent = '#ff6600';
  readonly defaultSearchPlaceholder = 'Wave a taxi, paste anything here.';
  @ViewChild('chainMenu') chainMenu: NgbDropdown;
  pendingSearchRequests = 0;
  isSearching = false;
  isTypeaheading$ = new BehaviorSubject<boolean>(false);
  typeAhead$: Observable<XmrSearchResults>;
  explorers$: Observable<TxTaxiExplorer[]>;
  thirdPartyExplorers$: typeof this.explorerRegistry.thirdPartyExplorers$;
  selectedChainId$ = new BehaviorSubject<string | undefined>(this.sourceChainId);
  activeTarget$ = new BehaviorSubject<SearchTarget>({
    kind: 'explorer',
    chainId: this.sourceChainId,
    name: 'Monero',
    accentColor: this.defaultChainAccent,
    iconUrl: this.defaultChainIconUrl,
    iconAlt: this.defaultChainIconAlt,
    searchPlaceholder: this.defaultSearchPlaceholder,
  });
  searchOptions$ = new BehaviorSubject<TxTaxiSearchOptions | undefined>(undefined);
  searchForm: UntypedFormGroup;
  dropdownHidden = true;
  explorerRegistryLoaded = false;
  private manualDestinationId: string | undefined;
  private hasManualSelection = false;
  private readonly selectionChanges$ = new BehaviorSubject(0);
  private readonly additionalExplorerIds = new Set<string>();
  readonly routerHubUrl = this.explorerRegistry.hubUrl;
  private explorers: TxTaxiExplorer[] = [];
  private manualChainId: string | undefined = this.sourceChainId;
  private manualOverrideSearchText: string | undefined;
  private manualOverrideTarget: SearchTarget | undefined;
  private searchOptions: TxTaxiSearchOptions | undefined;
  private suppressMenuOnFocus = false;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event) {
    if (!this.elementRef.nativeElement.contains(event.target)
      && !this.isSearching && !this.pendingSearchRequests) {
      this.chainMenu?.close();
    }
    if (this.elementRef.nativeElement.contains(event.target) && this.isSourceChainSelected()) {
      this.dropdownHidden = false;
    } else {
      this.dropdownHidden = true;
    }
  }

  @HostListener('document:keydown.escape')
  closeChainMenu(): void {
    this.chainMenu?.close();
  }

  private querySearchOptions(searchText: string, probe = false): Observable<TxTaxiSearchOptions | undefined> {
    return defer(() => {
      this.pendingSearchRequests++;
      return this.explorerRegistry.searchOptions$(searchText, probe, this.sourceChainId, this.hasManualSelection ? this.manualChainId : undefined, this.hasManualSelection ? this.manualDestinationId : undefined).pipe(
        finalize(() => this.pendingSearchRequests--),
      );
    });
  }

  @Output() searchTriggered = new EventEmitter();
  @ViewChild('searchResults') searchResults: SearchResultsComponent;
  @HostListener('keydown', ['$event']) keydown($event): void {
    this.handleKeyDown($event);
  }

  @ViewChild('searchInput') searchInput: ElementRef;

  private emptySearchResults(searchText = ''): XmrSearchResults {
    return {
      searchText,
      hashQuickMatch: false,
      blockHeight: false,
      blockOrTxHash: false,
      unsupportedAddress: false,
      showDropdown: false,
    };
  }

  constructor(
    private formBuilder: UntypedFormBuilder,
    private router: Router,
    private stateService: StateService,
    private relativeUrlPipe: RelativeUrlPipe,
    private elementRef: ElementRef,
    private http: HttpClient,
    private explorerRegistry: TxTaxiExplorerRegistryService,
  ) {
    this.explorers$ = this.explorerRegistry.explorers$;
  }

  ngOnInit(): void {
    this.thirdPartyExplorers$ = this.explorerRegistry.thirdPartyExplorers$;
    this.router.events.subscribe((e: NavigationStart) => { // Reset search focus when changing page
      if (this.searchInput && e.type === EventType.NavigationStart) {
        this.chainMenu?.close();
        this.searchInput.nativeElement.blur();
      }
    });

    this.stateService.searchFocus$.subscribe(() => {
      if (!this.searchInput) { // Try again a bit later once the view is properly initialized
        setTimeout(() => this.focusSearchInputWithoutMenu(), 100);
      } else if (this.searchInput) {
        this.focusSearchInputWithoutMenu();
      }
    });

    this.searchForm = this.formBuilder.group({
      searchText: ['', Validators.required],
    });

    this.explorers$.subscribe((explorers) => {
      this.explorerRegistryLoaded = true;
      this.explorers = explorers;
      this.updateActiveTarget();
    });

    const searchText$ = this.searchForm.get('searchText').valueChanges
    .pipe(
      map((text) => {
        return text.trim();
      }),
      tap((text) => {
        this.stateService.searchText$.next(text);
      }),
      distinctUntilChanged(),
      tap((text) => this.clearManualOverrideOnInputChange(text)),
      shareReplay(1),
    );

    const searchContext$ = combineLatest([searchText$.pipe(startWith('')), this.selectionChanges$]);
    searchContext$.pipe(
      debounceTime(120),
      switchMap(([searchText, revision]) => this.querySearchOptions(searchText).pipe(
        map((options) => ({ searchText, revision, options })),
      )),
    ).subscribe(({ searchText, revision, options }) => {
      if (options && this.currentSearchText() === searchText && revision === this.selectionChanges$.value) {
        this.setSearchOptions(options);
      }
    });

    searchContext$.pipe(
      debounceTime(420),
      switchMap(([searchText, revision]) => this.querySearchOptions(searchText, true).pipe(
        map((options) => ({ searchText, revision, options })),
      )),
    ).subscribe(({ searchText, revision, options }) => {
      if (options && this.currentSearchText() === searchText && revision === this.selectionChanges$.value) {
        this.setSearchOptions(options);
      }
    });


    const sourceSearchText$ = combineLatest([searchText$, this.selectedChainId$]).pipe(
      map(([searchText, chainId]) => this.isSourceChainSelected() ? searchText : ''),
      distinctUntilChanged(),
    );

    this.typeAhead$ = sourceSearchText$.pipe(
      debounceTime(100),
      map((searchText) => this.buildSearchResults(searchText)),
      startWith(this.emptySearchResults()),
    );
  }

  handleKeyDown($event): void {
    if (this.isSourceChainSelected()) {
      this.searchResults.handleKeyDown($event);
    }
  }

  trackExplorer(_index: number, explorer: TxTaxiExplorer): string {
    return explorer.id;
  }

  trackCandidate(_index: number, candidate: TxTaxiSearchCandidate): string {
    return `${candidate.chainId}:${candidate.destinationId || ''}:${candidate.objectType}`;
  }

  isSelectedExplorer(explorer: TxTaxiExplorer): boolean {
    const target = this.activeTarget$.value;
    const destinationId = explorer.destinationId || explorer.destinations?.find(destination => destination.default)?.destinationId;
    return target.kind !== 'router' && target.chainId === explorer.chainId
      && target.destinationId === destinationId;
  }

  isSelectedCandidate(candidate: TxTaxiSearchCandidate): boolean {
    const target = this.activeTarget$.value;
    return !this.selectedExplorer() && target.kind !== 'router' && target.chainId === candidate.chainId
      && target.destinationId === candidate.destinationId;
  }

  isOpenedExplorer(explorer: TxTaxiExplorer): boolean {
    return this.isSourceOrigin(explorer.origin);
  }

  selectedExplorer(): TxTaxiExplorer | undefined {
    return this.explorers.find(explorer => explorer.chainId === this.activeTarget$.value.chainId);
  }

  selectedExternalCandidate(): TxTaxiSearchCandidate | undefined {
    const target = this.activeTarget$.value;
    return !this.selectedExplorer() && target.candidate
      ? { ...target.candidate, confirmed: Boolean(target.confirmed), directUrl: target.directUrl }
      : undefined;
  }

  isSelectedExternalCandidate(candidate: TxTaxiSearchCandidate): boolean {
    const selected = this.selectedExternalCandidate();
    return Boolean(selected && selected.chainId === candidate.chainId && selected.destinationId === candidate.destinationId);
  }

  otherExplorers(explorers: TxTaxiExplorer[]): TxTaxiExplorer[] {
    const selected = this.selectedExplorer();
    return explorers.filter(explorer => explorer.chainId !== selected?.chainId);
  }

  childDestinations(explorer: TxTaxiExplorer): TxTaxiExplorer[] {
    return explorer.destinations?.filter(destination => !destination.default) || [];
  }

  additionalExplorersExpanded(explorer: TxTaxiExplorer): boolean {
    return this.additionalExplorerIds.has(explorer.chainId);
  }

  toggleAdditionalExplorers(explorer: TxTaxiExplorer): void {
    if (this.additionalExplorerIds.has(explorer.chainId)) this.additionalExplorerIds.delete(explorer.chainId);
    else this.additionalExplorerIds.add(explorer.chainId);
  }

  private isSourceOrigin(origin: string): boolean {
    if (typeof window === 'undefined') return false;
    const source = this.explorers.find(explorer => explorer.chainId === this.sourceChainId);
    const current = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
      ? source?.origin : window.location.origin;
    try { return Boolean(current && new URL(origin).origin === current); } catch { return false; }
  }

  private selectionChanged(): void {
    this.additionalExplorerIds.clear();
    this.isSearching = false;
    this.setSearchOptions(undefined);
    this.selectionChanges$.next(this.selectionChanges$.value + 1);
    const menu = this.elementRef.nativeElement?.querySelector?.('.search-chain-menu') as HTMLElement | undefined;
    const focusInMenu = typeof document !== 'undefined' && menu?.contains(document.activeElement);
    setTimeout(() => {
      if (!menu) return;
      menu.scrollTop = 0;
      if (focusInMenu) menu.querySelector<HTMLButtonElement>('.search-chain-selected-group .is-current button, .search-chain-selected-group button.search-chain-candidate')?.focus({ preventScroll: true });
    });
  }

  isSourceChainSelected(): boolean {
    const target = this.activeTarget$.value;
    return this.selectedChainId$.value === this.sourceChainId && (!target.origin || this.isSourceOrigin(target.origin));
  }

  isAutomaticRoutingSelected(): boolean {
    return this.manualChainId === undefined && this.activeTarget$.value.kind === 'router';
  }

  selectAutomaticRouting(): void {
    this.manualChainId = undefined;
    this.manualDestinationId = undefined;
    this.hasManualSelection = false;
    this.manualOverrideSearchText = undefined;
    this.manualOverrideTarget = undefined;
    this.selectionChanged();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  selectExplorer(explorer: TxTaxiExplorer): void {
    const destination = explorer.destinations?.find(item => item.default) || explorer.destinations?.[0] || explorer;
    this.manualChainId = destination.chainId;
    this.manualDestinationId = destination.destinationId;
    this.hasManualSelection = true;
    this.manualOverrideSearchText = this.currentSearchText();
    this.manualOverrideTarget = this.targetForExplorer(destination);
    this.selectionChanged();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  selectCandidate(candidate: TxTaxiSearchCandidate): void {
    this.manualChainId = candidate.chainId;
    this.manualDestinationId = candidate.destinationId;
    this.hasManualSelection = true;
    this.manualOverrideSearchText = this.currentSearchText();
    this.manualOverrideTarget = this.targetForCandidate(candidate);
    this.selectionChanged();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  private focusSearchInputWithoutMenu(): void {
    if (!this.searchInput) return;
    this.suppressMenuOnFocus = true;
    this.searchInput.nativeElement.focus();
    this.suppressMenuOnFocus = false;
  }

  onSearchInputFocus(): void {
    if (!this.suppressMenuOnFocus) this.showSourceSuggestions();
  }

  showSourceSuggestions(): void {
    this.chainMenu?.open();
    if (document.activeElement !== this.searchInput?.nativeElement) {
      this.searchInput?.nativeElement.focus();
    }
    this.dropdownHidden = !this.isSourceChainSelected();
  }

  itemSelected(): void {
    setTimeout(() => this.search());
  }

  selectedResult(result: any): void {
    if (typeof result === 'string') {
      this.search(result);
    }
  }

  search(result?: string): void {
    // xmr-space: simplified search resolver. Monero has no
    // chain-traceable address (so /address routes don't apply) and the
    // upstream `blockhash` regex requires Bitcoin-style leading-zero
    // hashes which Monero doesn't produce. Resolution rules:
    //   numeric → /block/<height>      (caps at current chain tip)
    //   64-hex  → probe /api/v1/block/:h ; if 200 → /block/:h
    //                                    ; else fall through to /tx/:h
    //   else    → no-op
    const searchText = result || this.searchForm.value.searchText.trim();
    if (!searchText) return;

    const manualTarget = this.currentManualTarget(searchText);
    if (manualTarget) {
      this.searchTarget(manualTarget, searchText);
      return;
    }

    const resolvedCandidate = this.resolvedCandidate();
    if (resolvedCandidate) {
      this.searchTarget(this.targetForCandidate(resolvedCandidate), searchText);
      return;
    }

    if (this.searchOptions?.input === searchText && this.searchOptions.phase === 'resolved' && this.searchOptions.candidates.length) {
      this.searchRouter(searchText);
      return;
    }

    this.isSearching = true;
    this.querySearchOptions(searchText, true).subscribe((options) => {
      if (this.currentSearchText() !== searchText) {
        this.isSearching = false;
        return;
      }

      if (options) {
        this.setSearchOptions(options);
      }

      const currentManualTarget = this.currentManualTarget(searchText);
      if (currentManualTarget) {
        this.searchTarget(currentManualTarget, searchText);
      } else if (this.resolvedCandidate()) {
        this.searchTarget(this.targetForCandidate(this.resolvedCandidate()!), searchText);
      } else if (options?.candidates.length) {
        this.searchRouter(searchText);
      } else {
        this.searchSourceChain(searchText);
      }
    });
  }

  private searchSourceChain(searchText: string): void {
    this.isSearching = true;

    const HEX64 = /^[a-f0-9]{64}$/i;
    const NUMERIC = /^[0-9]+$/;
    const XMR_ADDRESS = /^[48][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{94}(?:[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{11})?$/;

    if (XMR_ADDRESS.test(searchText)) {
      this.dropdownHidden = false;
      this.isSearching = false;
      return;
    }

    if (NUMERIC.test(searchText)) {
      const h = parseInt(searchText, 10);
      const tip = this.stateService.latestBlockHeight;
      if (Number.isSafeInteger(h) && h >= 0 && (tip < 0 || h <= tip)) {
        this.navigate('/block/', String(h));
      } else {
        this.isSearching = false;
      }
      return;
    }
    if (HEX64.test(searchText)) {
      // Try block first; if 404, try tx. Both target components
      // tolerate a not-found response with their own 404 UI.
      this.http
        .get(`/api/v1/block/${searchText}`, { observe: 'response' })
        .pipe(catchError(() => of(null)))
        .subscribe((resp: any) => {
          if (resp && resp.ok) {
            this.navigate('/block/', searchText);
          } else {
            this.navigate('/tx/', searchText);
          }
        });
      return;
    }
    this.isSearching = false;
  }

  private assignDestination(value: string, destinationHint?: Pick<SearchTarget, 'chainId' | 'destinationId'>): void {
    let lightning = false;
    try {
      const url = new URL(value);
      const registered = this.explorers.find(explorer => explorer.chainId === 'bitcoin')?.destinations?.find(destination => destination.destinationId === 'lightning');
      const routerOrigin = new URL(this.explorerRegistry.hubUrl).origin;
      const scopedForward = destinationHint?.chainId === 'bitcoin' && destinationHint.destinationId === 'lightning'
        && url.origin === routerOrigin && url.pathname.startsWith('/bitcoin/') && url.searchParams.get('destination') === 'lightning';
      lightning = Boolean(registered && !url.username && !url.password && (new URL(registered.origin).origin === url.origin || scopedForward));
    } catch { /* Only registry-owned destinations can animate into Lightning. */ }
    const transition = (window as Window & { txTaxiLightningNavigate?: (url: string) => Promise<void> }).txTaxiLightningNavigate;
    if (lightning && transition) { void transition(value); return; }
    window.location.assign(value);
  }

  private searchTarget(target: SearchTarget, searchText: string): void {
    if (target.destinationId && !target.destinationDefault) {
      this.isSearching = true;
      this.searchTriggered.emit();
      this.assignDestination(target.kind === 'candidate' && target.confirmed && target.directUrl
        ? this.explorerRegistry.navigationUrl(target.directUrl)
        : this.explorerRegistry.chainSearchUrl(target.chainId!, searchText, target.destinationId), target);
      return;
    }
    if (target.kind === 'explorer' && (!target.destinationId || target.destinationDefault) && target.chainId === this.sourceChainId && (!target.origin || this.isSourceOrigin(target.origin))) {
      this.searchSourceChain(searchText);
      return;
    }

    this.isSearching = true;
    this.searchTriggered.emit();
    if (target.kind === 'candidate' && target.confirmed && target.directUrl) {
      this.assignDestination(this.explorerRegistry.navigationUrl(target.directUrl), target);
      return;
    }

    if (target.chainId) {
      this.assignDestination(this.explorerRegistry.chainSearchUrl(target.chainId, searchText, target.destinationId), target);
      return;
    }

    this.searchRouter(searchText);
  }

  private searchRouter(searchText: string): void {
    this.isSearching = true;
    this.searchTriggered.emit();
    window.location.assign(this.explorerRegistry.routerSearchUrl(searchText, this.sourceChainId));
  }

  private clearManualOverrideOnInputChange(searchText: string): void {
    if (this.manualOverrideSearchText !== undefined && this.manualOverrideSearchText !== searchText) {
      this.manualOverrideSearchText = undefined;
      this.manualOverrideTarget = undefined;
    }
    this.setSearchOptions(undefined);
  }

  private currentSearchText(): string {
    return this.searchForm?.value?.searchText?.trim() || '';
  }

  private currentManualTarget(searchText = this.currentSearchText()): SearchTarget | undefined {
    return this.manualOverrideSearchText === searchText && this.manualOverrideTarget
      ? this.manualOverrideTarget
      : this.hasManualSelection ? this.defaultSearchTarget() : undefined;
  }

  private resolvedCandidate(): TxTaxiSearchCandidate | undefined {
    if (!this.searchOptions?.resolvedChainId || this.searchOptions.phase !== 'resolved' || this.searchOptions.input !== this.currentSearchText()) {
      return undefined;
    }

    return this.searchOptions.candidates.find(
      (candidate) => candidate.chainId === this.searchOptions?.resolvedChainId
        && (!this.searchOptions?.resolvedDestinationId || candidate.destinationId === this.searchOptions.resolvedDestinationId) && candidate.confirmed && candidate.confidence === 'strong' && Boolean(candidate.directUrl),
    );
  }

  private setSearchOptions(options: TxTaxiSearchOptions | undefined): void {
    if (
      options
      && this.searchOptions?.input === options.input
      && this.searchOptions.phase === 'resolved'
      && options.phase === 'classified'
    ) {
      return;
    }

    this.searchOptions = options;
    this.searchOptions$.next(options);
    this.updateActiveTarget();
  }

  private updateActiveTarget(): void {
    const manualTarget = this.currentManualTarget();
    const resolvedCandidate = manualTarget ? undefined : this.resolvedCandidate();
    const hasCandidates = !manualTarget && Boolean(this.searchOptions?.candidates.length);
    const target = manualTarget
      ?? (resolvedCandidate ? this.targetForCandidate(resolvedCandidate) : undefined)
      ?? (hasCandidates ? this.routerSearchTarget : this.defaultSearchTarget());
    const selectedChainId = manualTarget ? target.chainId : hasCandidates ? undefined : target.chainId;

    const activeTarget = this.activeTarget$.value;
    if (
      activeTarget.kind !== target.kind
      || activeTarget.chainId !== target.chainId
      || activeTarget.destinationId !== target.destinationId
      || activeTarget.origin !== target.origin
      || activeTarget.accentColor !== target.accentColor
      || activeTarget.directUrl !== target.directUrl
    ) {
      this.activeTarget$.next(target);
    }
    if (this.selectedChainId$.value !== selectedChainId || activeTarget.destinationId !== target.destinationId || activeTarget.origin !== target.origin) {
      this.selectedChainId$.next(selectedChainId);
    }
  }

  private defaultSearchTarget(): SearchTarget {
    if (this.manualChainId === undefined) return this.routerSearchTarget;
    const explorer = this.explorers.find((candidate) => candidate.chainId === this.manualChainId);
    const destination = explorer?.destinations?.find(item => item.destinationId === this.manualDestinationId)
      || explorer?.destinations?.find(item => item.default) || explorer;
    return destination ? this.targetForExplorer(destination) : {
      kind: 'explorer',
      chainId: this.sourceChainId,
      name: 'Monero',
      accentColor: this.defaultChainAccent,
      iconUrl: this.defaultChainIconUrl,
      iconAlt: this.defaultChainIconAlt,
      searchPlaceholder: this.defaultSearchPlaceholder,
    };
  }

  private targetForExplorer(explorer: TxTaxiExplorer): SearchTarget {
    return {
      kind: 'explorer',
      chainId: explorer.chainId,
      destinationId: explorer.destinationId,
      destinationDefault: explorer.default,
      origin: explorer.origin,
      name: explorer.destinationId && !explorer.default ? `${this.explorers.find(item => item.chainId === explorer.chainId)?.name || explorer.symbol} · ${explorer.name}` : this.explorers.find(item => item.chainId === explorer.chainId)?.name || explorer.name,
      accentColor: explorer.accentColor,
      iconUrl: explorer.iconUrl,
      iconAlt: explorer.iconAlt,
      searchPlaceholder: explorer.searchPlaceholder,
    };
  }

  private targetForCandidate(candidate: TxTaxiSearchCandidate): SearchTarget {
    return {
      kind: 'candidate',
      chainId: candidate.chainId,
      destinationId: candidate.destinationId,
      destinationDefault: candidate.destinationDefault,
      origin: candidate.directUrl ? new URL(candidate.directUrl).origin : candidate.host ? `https://${candidate.host}` : undefined,
      candidate,
      name: candidate.destinationName && !candidate.destinationDefault ? `${candidate.name} · ${candidate.destinationName}` : candidate.name,
      accentColor: candidate.accentColor,
      iconUrl: candidate.iconUrl,
      iconAlt: candidate.iconAlt,
      searchPlaceholder: `Search ${candidate.name}`,
      confirmed: candidate.confirmed,
      directUrl: candidate.directUrl,
    };
  }

  private readonly routerSearchTarget: SearchTarget = {
    kind: 'router',
    name: 'tx.taxi',
    accentColor: '#ffd21f',
    iconUrl: 'https://tx.taxi/assets/brand/router-favicon.svg',
    iconAlt: 'tx.taxi',
    searchPlaceholder: 'Search any supported chain',
  };


  navigate(url: string, searchText: string) {
    this.router.navigate([this.relativeUrlPipe.transform(url), searchText]);
    this.searchTriggered.emit();
    this.searchForm.setValue({
      searchText: '',
    });
    this.isSearching = false;
  }

  private buildSearchResults(searchText: string): XmrSearchResults {
    if (!searchText.length) {
      return this.emptySearchResults();
    }

    const searchHeight = parseInt(searchText, 10);
    const matchesBlockHeight = /^[0-9]+$/.test(searchText)
      && (this.stateService.latestBlockHeight < 0 || searchHeight <= this.stateService.latestBlockHeight);
    const matchesXmrHash = /^[a-f0-9]{64}$/i.test(searchText);
    const matchesXmrAddress = /^[48][123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{94}(?:[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{11})?$/.test(searchText);

    return {
      searchText,
      hashQuickMatch: matchesBlockHeight || matchesXmrHash,
      blockHeight: matchesBlockHeight,
      blockOrTxHash: matchesXmrHash,
      unsupportedAddress: matchesXmrAddress,
      showDropdown: matchesBlockHeight || matchesXmrHash || matchesXmrAddress,
    };
  }
}
