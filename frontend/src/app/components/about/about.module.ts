import { TxTaxiDocsIntroComponent } from '@app/shared/components/tx-taxi-docs-intro/tx-taxi-docs-intro.component';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';
import { AboutComponent } from '@components/about/about.component';
import { SharedModule } from '@app/shared/shared.module';

const routes: Routes = [
  {
    path: '',
    component: AboutComponent,
  }
];

@NgModule({
  imports: [
    RouterModule.forChild(routes)
  ],
  exports: [
    RouterModule
  ]
})
export class AboutRoutingModule { }

@NgModule({
  imports: [
    CommonModule,
    TxTaxiDocsIntroComponent,
    AboutRoutingModule,
    SharedModule,
  ],
  declarations: [
    AboutComponent,
  ]
})
export class AboutModule { }
