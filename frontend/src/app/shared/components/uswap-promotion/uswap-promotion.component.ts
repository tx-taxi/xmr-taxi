import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StorageService } from '@app/services/storage.service';

@Component({
  selector: 'app-uswap-promotion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './uswap-promotion.component.html',
  styleUrls: ['./uswap-promotion.component.scss'],
  host: { '[style.--promotion-accent]': 'accent' },
})
export class UswapPromotionComponent implements AfterViewInit, OnDestroy {
  @Input() chainName: string;
  @Input() asset: string;
  @Input() accent: string;

  dismissed = this.storage.getValue('tx-taxi:uswap-promotion:dismissed') === '1';
  private observer?: ResizeObserver;
  private frame = 0;
  private scheduleLayout = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.layout());
  };

  constructor(
    private element: ElementRef<HTMLElement>,
    private zone: NgZone,
    private storage: StorageService,
  ) { }

  get destination(): string {
    return `https://app.uswap.net/?to=asset_v1:${this.asset}:native:coin`;
  }

  ngAfterViewInit(): void {
    if (this.dismissed) return;
    const navbar = this.element.nativeElement.closest('.navbar');
    if (!navbar) return;
    this.zone.runOutsideAngular(() => {
      this.observer = new ResizeObserver(this.scheduleLayout);
      // The brand changes width when its SVG finishes loading.
      [navbar, ...navbar.querySelectorAll('.navbar-brand, .navbar-nav, .search-form-container')]
        .forEach(element => this.observer.observe(element));
      window.addEventListener('resize', this.scheduleLayout, { passive: true });
      this.scheduleLayout();
    });
  }

  dismiss(): void {
    this.dismissed = true;
    this.storage.setValue('tx-taxi:uswap-promotion:dismissed', '1');
    this.element.nativeElement.hidden = true;
    this.ngOnDestroy();
  }

  private layout(): void {
    const host = this.element.nativeElement;
    const navbar = host.closest('.navbar');
    const navigation = navbar?.querySelector('.navbar-nav');
    const search = navbar?.querySelector('.search-form-container');
    if (!navbar || !navigation || !search || this.dismissed) return;
    const bounds = navbar.getBoundingClientRect();
    const center = bounds.left + bounds.width / 2;
    const left = navigation.getBoundingClientRect().right;
    const right = search.getBoundingClientRect().left;
    const available = Math.floor(2 * Math.min(center - left - 10, right - center - 10));
    const desktop = window.matchMedia('(min-width: 992px)').matches;
    host.style.width = `${Math.max(0, Math.min(440, available))}px`;
    host.hidden = !desktop || available < 190;
    // Never grow the native navbar or cover its controls at narrow widths/zoom.
    if (!host.hidden && host.getBoundingClientRect().height > bounds.height - 6) host.hidden = true;
    host.style.visibility = 'visible';
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    window.removeEventListener('resize', this.scheduleLayout);
    cancelAnimationFrame(this.frame);
  }
}
