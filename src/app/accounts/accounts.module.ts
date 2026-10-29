import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { AccountsRoutingModule } from './accounts-routing.module';
import { AccountsComponent } from './accounts.component';
import { LedgersComponent } from './ledgers/ledgers.component';
import { ArApAgingComponent } from './ar-ap-aging/ar-ap-aging.component';
import { VouchersComponent } from './vouchers/vouchers.component';
import { ChequesComponent } from './cheques/cheques.component';
import { BankReconcileComponent } from './bank-reconcile/bank-reconcile.component';

@NgModule({
  declarations: [
    AccountsComponent,
    LedgersComponent,
    ArApAgingComponent,
    VouchersComponent,
    ChequesComponent,
    BankReconcileComponent
  ],
  imports: [
    SharedModule,
    AccountsRoutingModule
  ]
})
export class AccountsModule { }
