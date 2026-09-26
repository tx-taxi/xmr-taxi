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
  private explorers: TxTaxiExplorer[] = [];
  private manualChainId: string | undefined = this.sourceChainId;
  private manualOverrideSearchText: string | undefined;
  private manualOverrideTarget: SearchTarget | undefined;
  private searchOptions: TxTaxiSearchOptions | undefined;

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
      return this.explorerRegistry.searchOptions$(searchText, probe, this.sourceChainId).pipe(
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
        setTimeout(() => this.searchInput.nativeElement.focus(), 100);
      } else if (this.searchInput) {
        this.searchInput.nativeElement.focus();
      }
    });

    this.searchForm = this.formBuilder.group({
      searchText: ['', Validators.required],
    });

    this.explorers$.subscribe((explorers) => {
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

    searchText$.pipe(
      debounceTime(120),
      switchMap((searchText) => this.querySearchOptions(searchText).pipe(
        map((options) => ({ searchText, options })),
      )),
    ).subscribe(({ searchText, options }) => {
      if (options && this.currentSearchText() === searchText) {
        this.setSearchOptions(options);
      }
    });

    searchText$.pipe(
      debounceTime(420),
      switchMap((searchText) => this.querySearchOptions(searchText, true).pipe(
        map((options) => ({ searchText, options })),
      )),
    ).subscribe(({ searchText, options }) => {
      if (options && this.currentSearchText() === searchText) {
        this.setSearchOptions(options);
      }
    });

    const sourceSearchText$ = combineLatest([searchText$, this.selectedChainId$]).pipe(
      map(([searchText, chainId]) => chainId === this.sourceChainId ? searchText : ''),
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
    return explorer.chainId;
  }

  trackCandidate(_index: number, candidate: TxTaxiSearchCandidate): string {
    return candidate.chainId;
  }

  isSelectedExplorer(explorer: TxTaxiExplorer): boolean {
    return explorer.chainId === this.manualChainId
      && (!this.searchOptions?.candidates.length || this.currentManualTarget()?.kind === 'explorer');
  }

  isSelectedCandidate(candidate: TxTaxiSearchCandidate): boolean {
    const target = this.activeTarget$.value;
    return target.kind === 'candidate' && target.chainId === candidate.chainId;
  }

  isSourceChainSelected(): boolean {
    return this.selectedChainId$.value === this.sourceChainId;
  }

  isAutomaticRoutingSelected(): boolean {
    return this.manualChainId === undefined && !this.currentManualTarget();
  }

  selectAutomaticRouting(): void {
    this.manualChainId = undefined;
    this.manualOverrideSearchText = undefined;
    this.manualOverrideTarget = undefined;
    this.updateActiveTarget();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  selectExplorer(explorer: TxTaxiExplorer): void {
    this.manualChainId = explorer.chainId;
    this.manualOverrideSearchText = this.currentSearchText();
    this.manualOverrideTarget = this.targetForExplorer(explorer);
    this.updateActiveTarget();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  selectCandidate(candidate: TxTaxiSearchCandidate): void {
    this.manualOverrideSearchText = this.currentSearchText();
    this.manualOverrideTarget = this.targetForCandidate(candidate);
    this.updateActiveTarget();
    this.dropdownHidden = true;
    setTimeout(() => this.dropdownHidden = true);
  }

  showSourceSuggestions(): void {
    this.chainMenu?.open();
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

  private searchTarget(target: SearchTarget, searchText: string): void {
    if (target.kind === 'explorer' && target.chainId === this.sourceChainId) {
      this.searchSourceChain(searchText);
      return;
    }

    this.isSearching = true;
    this.searchTriggered.emit();
    if (target.kind === 'candidate' && target.confirmed && target.directUrl) {
      window.location.assign(target.directUrl);
      return;
    }

    if (target.chainId) {
      window.location.assign(this.explorerRegistry.chainSearchUrl(target.chainId, searchText));
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
    return this.manualOverrideSearchText === searchText ? this.manualOverrideTarget : undefined;
  }

  private resolvedCandidate(): TxTaxiSearchCandidate | undefined {
    if (!this.searchOptions?.resolvedChainId || this.searchOptions.phase !== 'resolved' || this.searchOptions.input !== this.currentSearchText()) {
      return undefined;
    }

    return this.searchOptions.candidates.find(
      (candidate) => candidate.chainId === this.searchOptions?.resolvedChainId && candidate.confirmed && candidate.confidence === 'strong' && Boolean(candidate.directUrl),
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

    if (this.selectedChainId$.value !== selectedChainId) {
      this.selectedChainId$.next(selectedChainId);
    }

    const activeTarget = this.activeTarget$.value;
    if (
      activeTarget.kind !== target.kind
      || activeTarget.chainId !== target.chainId
      || activeTarget.accentColor !== target.accentColor
      || activeTarget.directUrl !== target.directUrl
    ) {
      this.activeTarget$.next(target);
    }
  }

  private defaultSearchTarget(): SearchTarget {
    if (this.manualChainId === undefined) return this.routerSearchTarget;
    const explorer = this.explorers.find((candidate) => candidate.chainId === this.manualChainId);
    return explorer ? this.targetForExplorer(explorer) : {
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
      name: explorer.name,
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
      name: candidate.name,
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
    iconUrl: 'https://tx.taxi/assets/brand/taxi-logo.svg',
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
