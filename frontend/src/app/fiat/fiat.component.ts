import { Component, OnInit, ChangeDetectionStrategy, Input, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { Price } from '@app/services/price.service';
import { StateService } from '@app/services/state.service';

@Component({
  selector: 'app-fiat',
  templateUrl: './fiat.component.html',
  styleUrls: [],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiatComponent implements OnInit, OnDestroy {
  conversions$: Observable<any>;
  currencySubscription: Subscription;
  currency: string;

  @Input() value: number;
  @Input() digitsInfo = '1.2-2';
  @Input() blockConversion: Price;
  @Input() colorClass = 'fiat-color';

  constructor(
    private stateService: StateService,
    private cd: ChangeDetectorRef,
  ) {
    this.currencySubscription = this.stateService.fiatCurrency$.subscribe((fiat) => {
      this.currency = fiat;
      this.cd.markForCheck();
    });
  }

  ngOnInit(): void {
    this.conversions$ = this.stateService.conversions$.asObservable();
  }

  ngOnDestroy(): void {
    this.currencySubscription.unsubscribe();
  }

  getRate(conversions?: Record<string, number>): number | null {
    const historical = this.blockConversion;
    const direct = historical ? historical.price?.[this.currency] : conversions?.[this.currency];
    if (Number.isFinite(direct) && direct > 0) {
      return direct;
    }
    if (historical) {
      const usd = historical.price?.USD;
      const exchange = historical.exchangeRates?.['USD' + this.currency];
      const converted = usd * exchange;
      return Number.isFinite(converted) && converted > 0 ? converted : null;
    }
    return null;
  }

}
