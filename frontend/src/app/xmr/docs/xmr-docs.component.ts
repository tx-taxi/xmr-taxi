import { AfterViewInit, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeoService } from '@app/services/seo.service';

type DocsTab = 'faq' | 'rest' | 'websocket' | 'sse';
interface DocsSection { id: string; title: string; category?: string; }

/** Monero-specific content in the established mempool documentation shell. */
@Component({ selector: 'app-xmr-docs', templateUrl: './xmr-docs.component.html', styleUrls: ['./xmr-docs.component.scss'], standalone: false })
export class XmrDocsComponent implements OnInit, AfterViewInit {
  activeTab: DocsTab = 'faq';
  readonly initMessage = '{"action":"init"}';
  readonly pongMessage = '{"action":"pong"}';
  readonly poolDeltaMessage = '{"added":[…],"removed":[…]}';
  readonly tabs: Array<{ id: DocsTab; title: string }> = [
    { id: 'faq', title: 'FAQ' }, { id: 'rest', title: 'REST API' }, { id: 'websocket', title: 'WebSocket' }, { id: 'sse', title: 'SSE' },
  ];
  readonly sections: Record<DocsTab, DocsSection[]> = {
    faq: [
      { id: 'what-is-xmr-taxi', title: $localize`:@@xmr.docs.what:What is xmr.tx.taxi?` }, { id: 'what-is-a-mempool', title: $localize`:@@xmr.docs.mempool:What is a mempool?` },
      { id: 'hidden-amounts', title: $localize`:@@xmr.docs.amounts:Why are amounts hidden?` }, { id: 'addresses', title: $localize`:@@xmr.docs.addresses:Why is there no public address history?` },
      { id: 'fees', title: $localize`:@@xmr.docs.fees:How do Monero fees work?` }, { id: 'confirmations', title: $localize`:@@xmr.docs.confirmations:What does pending or confirmed mean?` },
      { id: 'payment-proof', title: $localize`:@@xmr.docs.proof:Can I verify a payment?` }, { id: 'mining-attribution', title: $localize`:@@xmr.docs.mining:How are mining pools identified?` },
    ],
    rest: [
      { id: 'rest-overview', title: $localize`:@@xmr.docs.overview:Overview`, category: $localize`:@@xmr.docs.gettingStarted:Getting started` }, { id: 'rest-chain', title: $localize`:@@xmr.docs.chainBlocks:Chain and blocks`, category: $localize`:@@xmr.docs.endpoints:Endpoints` },
      { id: 'rest-transactions', title: $localize`:@@xmr.docs.transactionsMempool:Transactions and mempool`, category: $localize`:@@xmr.docs.endpoints:Endpoints` }, { id: 'rest-fees', title: $localize`:@@xmr.docs.feesHistory:Fees and history`, category: $localize`:@@xmr.docs.endpoints:Endpoints` },
      { id: 'rest-mining', title: $localize`:@@xmr.docs.miningData:Mining data`, category: $localize`:@@xmr.docs.endpoints:Endpoints` }, { id: 'rest-proof', title: $localize`:@@xmr.docs.transactionProof:Transaction proof`, category: $localize`:@@xmr.docs.verification:Verification` }, { id: 'rest-daemon', title: $localize`:@@xmr.docs.daemonBridge:Public daemon bridge`, category: $localize`:@@xmr.docs.verification:Verification` },
    ],
    websocket: [
      { id: 'ws-connect', title: $localize`:@@xmr.docs.connectInitialize:Connect and initialize`, category: $localize`:@@xmr.docs.connection:Connection` }, { id: 'ws-events', title: $localize`:@@xmr.docs.serverMessages:Server messages`, category: $localize`:@@xmr.docs.eventCategory:Events` }, { id: 'ws-commands', title: $localize`:@@xmr.docs.clientMessages:Client messages`, category: $localize`:@@xmr.docs.commands:Commands` },
    ],
    sse: [ { id: 'sse-connect', title: $localize`:@@xmr.docs.connect:Connect`, category: $localize`:@@xmr.docs.connection:Connection` }, { id: 'sse-events', title: $localize`:@@xmr.docs.events:Events and reconnection`, category: $localize`:@@xmr.docs.eventCategory:Events` } ],
  };

  constructor(private seoService: SeoService, private router: Router, private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.seoService.setTitle($localize`:@@xmr.docs.browser-title:Documentation`);
    this.seoService.setDescription($localize`:@@meta.description.xmr.docs:Monero explorer documentation: privacy-safe public data, REST endpoints, and live streams.`);
    this.activeTab = this.tabForUrl(this.router.url);
  }

  ngAfterViewInit(): void {
    this.route.fragment.subscribe((fragment) => {
      if (fragment) {
        requestAnimationFrame(() => document.getElementById(fragment)?.scrollIntoView({ block: 'start' }));
      }
    });
  }

  selectTab(tab: DocsTab): void {
    this.activeTab = tab;
    const path = tab === 'faq' ? '/docs/faq' : `/docs/api/${tab === 'rest' ? 'rest' : tab}`;
    void this.router.navigateByUrl(path);
  }

  anchorLinkClick(event: MouseEvent, fragment: string): void {
    event.preventDefault();
    document.getElementById(fragment)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${fragment}`);
  }

  private tabForUrl(url: string): DocsTab {
    if (url.includes('/api/websocket')) {
      return 'websocket';
    }
    if (url.includes('/api/sse')) {
      return 'sse';
    }
    return url.includes('/api') ? 'rest' : 'faq';
  }
}
