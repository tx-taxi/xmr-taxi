import { Component, ChangeDetectionStrategy, Input } from '@angular/core';
import { Transaction } from '@interfaces/electrs.interface';

@Component({
  selector: 'app-tx-features',
  templateUrl: './tx-features.component.html',
  styleUrls: ['./tx-features.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TxFeaturesComponent {
  @Input() tx: Transaction;
  ringTypeTooltip(): string { return $localize`:@@xmr.features.ringType:RingCT type ${this.tx.rct_type}:type:: ${this.tx.rct_type_name}:name:`; }
}
