import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { TxTaxiDocsIntroComponent } from '@app/shared/components/tx-taxi-docs-intro/tx-taxi-docs-intro.component';
import { XmrDocsComponent } from './xmr-docs.component';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'faq',
    pathMatch: 'full',
  },
  {
    path: 'faq',
    component: XmrDocsComponent,
  },
  {
    path: 'api',
    redirectTo: 'api/rest',
    pathMatch: 'full',
  },
  {
    path: 'api/rest',
    component: XmrDocsComponent,
  },
  {
    path: 'api/websocket',
    component: XmrDocsComponent,
  },
  {
    path: 'api/sse',
    component: XmrDocsComponent,
  },
];

@NgModule({
  declarations: [XmrDocsComponent],
  imports: [CommonModule, RouterModule.forChild(routes), TxTaxiDocsIntroComponent],
})
export class XmrDocsModule {}
