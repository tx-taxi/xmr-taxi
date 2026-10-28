import { Component } from '@angular/core';
import { SeoService } from '@app/services/seo.service';
import { OpenGraphService } from '@app/services/opengraph.service';

@Component({
  selector: 'app-trademark-policy',
  templateUrl: './trademark-policy.component.html',
  styleUrls: ['./trademark-policy.component.scss'],
  standalone: false,
})
export class TrademarkPolicyComponent {
  constructor(
    private seoService: SeoService,
    private ogService: OpenGraphService,
  ) { }

  ngOnInit(): void {
    this.seoService.setTitle($localize`:@@xmr.legal.trademark-policy.meta-title:Trademark & Attribution`);
    this.seoService.setDescription($localize`:@@xmr.legal.trademark-policy.meta-description:Trademark and attribution notes for xmr.tx.taxi, including upstream mempool/mempool attribution and Monero project independence.`);
    this.ogService.setManualOgImage('trademark-policy.jpg');
  }
}
