import { Injectable, NgZone } from '@angular/core';
import { Meta } from '@angular/platform-browser';
import { Router, ActivatedRoute, NavigationEnd } from '@angular/router';
import { filter, map, switchMap } from 'rxjs/operators';
import { combineLatest } from 'rxjs';
import { StateService } from '@app/services/state.service';

@Injectable({
  providedIn: 'root'
})
export class OpenGraphService {
  network = '';
  defaultImageUrl = '';
  previewLoadingEvents = {}; // pending count per event type
  previewLoadingCount = 0; // number of unique events pending
  sessionId = 1;

  constructor(
    private ngZone: NgZone,
    private metaService: Meta,
    private stateService: StateService,
    private router: Router,
    private activatedRoute: ActivatedRoute,
  ) {
    this.defaultImageUrl = 'https://tx.taxi/assets/og/explorers/monero.png?v=20260925-brand';
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
      if (data.ogImage) {
        this.setOgImage();
      } else {
        this.clearOgImage();
      }
    });

    // expose routing method to global scope, so we can access it from the unfurler
    window['ogService'] = {
      loadPage: (path) => { return this.loadPage(path); }
    };
  }

  setOgImage() {
    // Entity cards are owned by the Monero explorer, but no renderer is live
    // yet. Preserve the valid default card rather than claim a dynamic image.
    this.clearOgImage();
  }

  clearOgImage() {
    const entity = this.router.url.split('?')[0].match(/^\/(tx|block)\/([^/]+)$/);
    const image = entity ? `https://xmr.tx.taxi/og/xmr/${entity[1]}/${entity[2]}.png?v=20260925-brand` : this.defaultImageUrl;
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
    this.metaService.updateTag({ property: 'og:image:type', content: 'image/png' });
    this.metaService.updateTag({ property: 'og:image:width', content: '1200' });
    this.metaService.updateTag({ property: 'og:image:height', content: '630' });
  }

  setManualOgImage(_imageFilename) {
    this.clearOgImage();
  }

  /// register an event that needs to resolve before we can take a screenshot
  waitFor(event: string): number {
    if (!this.previewLoadingEvents[event]) {
      this.previewLoadingEvents[event] = 1;
      this.previewLoadingCount++;
    } else {
      this.previewLoadingEvents[event]++;
    }
    this.metaService.updateTag({ property: 'og:preview:loading', content: 'loading'});
    return this.sessionId;
  }

  // mark an event as resolved
  // if all registered events have resolved, signal we are ready for a screenshot
  waitOver({ event, sessionId }: { event: string, sessionId: number }) {
    if (sessionId !== this.sessionId) {
      return;
    }
    if (this.previewLoadingEvents[event]) {
      this.previewLoadingEvents[event]--;
      if (this.previewLoadingEvents[event] === 0 && this.previewLoadingCount > 0) {
        delete this.previewLoadingEvents[event];
        this.previewLoadingCount--;
      }
    }
    if (this.previewLoadingCount === 0) {
      this.metaService.updateTag({ property: 'og:preview:ready', content: 'ready'});
    }
  }

  fail({ event, sessionId }: { event: string, sessionId: number }) {
    if (sessionId !== this.sessionId) {
      return;
    }
    if (this.previewLoadingEvents[event]) {
      this.metaService.updateTag({ property: 'og:preview:fail', content: 'fail'});
    }
  }

  resetLoading() {
    this.previewLoadingEvents = {};
    this.previewLoadingCount = 0;
    this.sessionId++;
    this.metaService.removeTag('property=\'og:preview:loading\'');
    this.metaService.removeTag('property=\'og:preview:ready\'');
    this.metaService.removeTag('property=\'og:preview:fail\'');
    this.metaService.removeTag('property=\'og:meta:ready\'');
  }

  loadPage(path) {
    if (path !== this.router.url) {
      this.resetLoading();
      this.ngZone.run(() => {
        this.router.navigateByUrl(path);
      });
    }
  }
}
