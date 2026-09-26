import { AfterViewInit, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SeoService } from '@app/services/seo.service';

type DocsTab = 'faq' | 'rest' | 'websocket' | 'sse';
interface DocsSection { id: string; title: string; category?: string; }

/** Monero-specific content in the established mempool documentation shell. */
@Component({ selector: 'app-xmr-docs', templateUrl: './xmr-docs.component.html', styleUrls: ['./xmr-docs.component.scss'], standalone: false })
export class XmrDocsComponent implements OnInit, AfterViewInit {
  activeTab: DocsTab = 'faq';
  readonly tabs: Array<{ id: DocsTab; title: string }> = [
    { id: 'faq', title: 'FAQ' }, { id: 'rest', title: 'REST API' }, { id: 'websocket', title: 'WebSocket' }, { id: 'sse', title: 'SSE' },
  ];
  readonly sections: Record<DocsTab, DocsSection[]> = {
    faq: [
      { id: 'what-is-xmr-taxi', title: 'What is xmr.tx.taxi?' }, { id: 'what-is-a-mempool', title: 'What is a mempool?' },
      { id: 'hidden-amounts', title: 'Why are amounts hidden?' }, { id: 'addresses', title: 'Why is there no public address history?' },
      { id: 'fees', title: 'How do Monero fees work?' }, { id: 'confirmations', title: 'What does pending or confirmed mean?' },
      { id: 'payment-proof', title: 'Can I verify a payment?' }, { id: 'mining-attribution', title: 'How are mining pools identified?' },
    ],
    rest: [
      { id: 'rest-overview', title: 'Overview', category: 'Getting started' }, { id: 'rest-chain', title: 'Chain and blocks', category: 'Endpoints' },
      { id: 'rest-transactions', title: 'Transactions and mempool', category: 'Endpoints' }, { id: 'rest-fees', title: 'Fees and history', category: 'Endpoints' },
      { id: 'rest-mining', title: 'Mining data', category: 'Endpoints' }, { id: 'rest-proof', title: 'Transaction proof', category: 'Verification' }, { id: 'rest-daemon', title: 'Public daemon bridge', category: 'Verification' },
    ],
    websocket: [
      { id: 'ws-connect', title: 'Connect and initialize', category: 'Connection' }, { id: 'ws-events', title: 'Server messages', category: 'Events' }, { id: 'ws-commands', title: 'Client messages', category: 'Commands' },
    ],
    sse: [ { id: 'sse-connect', title: 'Connect', category: 'Connection' }, { id: 'sse-events', title: 'Events and reconnection', category: 'Events' } ],
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
