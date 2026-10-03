import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, switchMap } from 'rxjs';
import { StateService } from '@app/services/state.service';
import { LanguageService } from '@app/services/language.service';
import { languages } from '@app/app.constants';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  network = '';
  baseTitle = 'xmr.tx.taxi';
  baseDescription = 'Explore Monero blocks, transactions, mempool activity, mining data, and privacy-preserving RingCT metadata.';
  baseDomain = 'xmr.tx.taxi';

  canonicalLink: HTMLLinkElement = document.getElementById('canonical') as HTMLLinkElement;
  private alternateLinks: { link: HTMLLinkElement; seg: string }[] = [];

  constructor(
    private titleService: Title,
    private metaService: Meta,
    private stateService: StateService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private languageService: LanguageService,
  ) {
    // Chain defaults remain stable when the initial document describes a leaf page.
    try {
      const canonicalUrl = new URL(this.canonicalLink?.href || '');
      if (canonicalUrl.host === 'xmr.tx.taxi') this.baseDomain = canonicalUrl.host;
    } catch (e) {
      // leave as default
    }

    this.stateService.networkChanged$.subscribe((network) => this.network = network);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(() => this.activatedRoute),
      map(route => {
        while (route.firstChild) {route = route.firstChild;}
        return route;
      }),
      filter(route => route.outlet === 'primary'),
      switchMap(route => route.data),
    ).subscribe((data) => {
      this.clearSoft404();
      this.clearJsonLd('breadcrumb');
      this.updateCanonical(this.router.url.split('?')[0].split('#')[0]);
      const page = this.nativePage();
      if (page && page.path !== '/') { this.setTitle(page.title); this.setDescription(page.description); }
    });

    this.setStructuredData();
  }

  private nativeSeoData(): { pages: {path: string; title: string; description: string}[]; aliases: Record<string, string> } {
    try { return JSON.parse(document.getElementById('native-seo-data')?.textContent || '{}'); }
    catch { return { pages: [], aliases: {} }; }
  }

  private nativePage(path = this.router.url): {path: string; title: string; description: string} | undefined {
    const data = this.nativeSeoData();
    const pathname = new URL(path, 'https://' + this.baseDomain).pathname.replace(/\/$/, '') || '/';
    const canonicalPath = data.aliases?.[pathname] || pathname;
    return data.pages?.find(page => page.path === canonicalPath);
  }

  private updateDiscoveryLinks(canonical: string): void {
    const page = this.nativePage();
    const head = document.head;
    for (const [rel, type, href] of [
      ['alternate', 'text/markdown', canonical + (page?.path === '/' ? 'index' : '') + '.md'],
      ['describedby', 'text/plain', 'https://' + this.baseDomain + '/llms.txt'],
    ]) {
      const existing = head.querySelector<HTMLLinkElement>('link[rel="' + rel + '"][type="' + type + '"]');
      if (rel === 'alternate' && !page) { existing?.remove(); continue; }
      const link = existing || document.createElement('link');
      link.rel = rel; link.type = type; link.href = href;
      if (!existing) head.appendChild(link);
    }
  }

  setTitle(newTitle: string): void {
    const native = this.nativePage();
    if (native && native.path !== '/') newTitle = native.title;
    const fullTitle = newTitle + ' - ' + this.getTitle();
    this.titleService.setTitle(fullTitle);
    this.metaService.updateTag({ property: 'og:title', content: fullTitle});
    this.metaService.updateTag({ name: 'twitter:title', content: fullTitle});
    this.metaService.updateTag({ property: 'og:meta:ready', content: 'ready'});
  }

  resetTitle(): void {
    this.titleService.setTitle(this.getTitle());
    this.metaService.updateTag({ property: 'og:title', content: this.getTitle()});
    this.metaService.updateTag({ name: 'twitter:title', content: this.getTitle()});
    this.metaService.updateTag({ property: 'og:meta:ready', content: 'ready'});
  }

  setEnterpriseTitle(title: string, override: boolean = false) {
    if (override) {
      this.baseTitle = title;
    } else {
      this.baseTitle = title + ' - ' + this.baseTitle;
    }
    this.resetTitle();
  }

  setDescription(newDescription: string): void {
    newDescription = this.nativePage()?.description || newDescription;
    this.metaService.updateTag({ name: 'description', content: newDescription});
    this.metaService.updateTag({ name: 'twitter:description', content: newDescription});
    this.metaService.updateTag({ property: 'og:description', content: newDescription});
  }

  resetDescription(): void {
    this.metaService.updateTag({ name: 'description', content: this.getDescription()});
    this.metaService.updateTag({ name: 'twitter:description', content: this.getDescription()});
    this.metaService.updateTag({ property: 'og:description', content: this.getDescription()});
  }

  updateCanonical(path) {
    const localePrefix = this.languageService.getLanguageForUrl();
    const native = this.nativePage(path);
    const canonicalUrl = 'https://' + this.baseDomain + (native?.path || localePrefix + path);
    this.canonicalLink?.setAttribute('href', canonicalUrl);
    this.updateDiscoveryLinks(canonicalUrl);
    const pageSchema = document.getElementById('native-page-schema');
    const schemaPage = this.nativePage(path);
    if (pageSchema) {
      if (schemaPage) pageSchema.textContent = JSON.stringify({'@context': 'https://schema.org', '@type': schemaPage.path.startsWith('/docs/') ? 'TechArticle' : 'WebPage', name: schemaPage.title, description: schemaPage.description, url: canonicalUrl});
      else pageSchema.remove();
    }
    this.metaService.updateTag({ property: 'og:url', content: canonicalUrl });
    this.updateHreflang(path);
  }

  // Emit <link rel="alternate" hreflang> for every supported locale + x-default.
  // The link elements are created once, then their hrefs are updated on each
  // navigation. NOTE: injected client-side, so only JS-rendering crawlers see
  // them today — they become fully effective once SSR/prerendering is enabled.
  private updateHreflang(path: string): void {
    if (!this.alternateLinks.length) {
      const head = document.getElementsByTagName('head')[0];
      const make = (hreflang: string, seg: string): void => {
        const link = document.createElement('link');
        link.setAttribute('rel', 'alternate');
        link.setAttribute('hreflang', hreflang);
        head.appendChild(link);
        this.alternateLinks.push({ link, seg });
      };
      for (const lang of languages) {
        make(lang.code, lang.code === 'en' ? '' : '/' + lang.code);
      }
      make('x-default', '');
    }
    for (const { link, seg } of this.alternateLinks) {
      link.setAttribute('href', 'https://' + this.baseDomain + seg + path);
    }
  }

  // Site-wide WebSite + Organization structured data, injected once at startup.
  private setStructuredData(): void {
    const origin = 'https://' + this.baseDomain;
    this.setJsonLd('site', {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': origin + '/#website',
          url: origin + '/',
          name: this.baseTitle,
          description: this.baseDescription,
          inLanguage: 'en',
        },
        {
          '@type': 'Organization',
          '@id': origin + '/#organization',
          name: this.baseTitle,
          url: origin + '/',
          logo: origin + '/resources/favicons/apple-touch-icon.png',
        },
      ],
    });
  }

  // BreadcrumbList for the current entity page (block/tx). Cleared on navigation.
  setBreadcrumb(items: { name: string; path: string }[]): void {
    const origin = 'https://' + this.baseDomain;
    this.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: items.map((item, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: item.name,
        item: origin + item.path,
      })),
    });
  }

  private setJsonLd(id: string, data: unknown): void {
    const elementId = 'jsonld-' + id;
    let script = document.getElementById(elementId) as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = elementId;
      script.type = 'application/ld+json';
      document.getElementsByTagName('head')[0].appendChild(script);
    }
    script.textContent = JSON.stringify(data);
  }

  private clearJsonLd(id: string): void {
    const script = document.getElementById('jsonld-' + id);
    if (script) {
      script.remove();
    }
  }

  getTitle(): string {
    return this.baseTitle + ' - Monero Explorer';
  }

  getDescription(): string {
    return this.baseDescription;
  }

  clearSoft404() {
    window['soft404'] = false;
    this.metaService.removeTag('name=\'robots\'');
  }

  logSoft404() {
    window['soft404'] = true;
    // Invalid block/tx/route → tell crawlers not to index this soft-404.
    // (The SPA otherwise returns HTTP 200 with a self-referential canonical.)
    this.metaService.updateTag({ name: 'robots', content: 'noindex, follow' });
  }
}
