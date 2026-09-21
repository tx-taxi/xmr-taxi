import { AfterViewInit, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SeoService } from '@app/services/seo.service';

/**
 * Single-page Monero-focused docs replacing upstream's tabbed
 * FAQ/REST/WebSocket/Electrum docs. The old upstream `api-docs-data.ts`
 * dataset was removed because it was a large Bitcoin-shaped surface.
 * This component covers the docs that actually apply to xmr-space:
 * the FAQ + REST endpoints we serve.
 */
@Component({
  selector: 'app-xmr-docs',
  templateUrl: './xmr-docs.component.html',
  styleUrls: ['./xmr-docs.component.scss'],
  standalone: false,
})
export class XmrDocsComponent implements OnInit, AfterViewInit {
  constructor(
    private seoService: SeoService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.seoService.setTitle($localize`:@@xmr.docs.browser-title:Documentation`);
    this.seoService.setDescription($localize`:@@meta.description.xmr.docs:Monero explorer API reference: REST endpoints, WebSocket and SSE streams, plus an FAQ on mempool data and RingCT privacy.`);
  }

  ngAfterViewInit(): void {
    const path = this.router.url.split(/[?#]/, 1)[0];
    const section = path.endsWith('/api/websocket')
      ? 'ws'
      : path.endsWith('/faq')
        ? 'faq'
        : path === '/api' || path.includes('/api/')
          ? 'rest'
          : null;

    if (section) {
      requestAnimationFrame(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }));
    }
  }
}
