import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { CustomersRoutingModule } from './customers-routing.module';
import { CustomersComponent } from './customers.component';
import { CustomerListComponent } from './customer-list/customer-list.component';
import { Customer360Component } from './customer-360/customer-360.component';
import { LoyaltyComponent } from './loyalty/loyalty.component';
import { GiftVouchersComponent } from './gift-vouchers/gift-vouchers.component';

@NgModule({
  declarations: [
    CustomersComponent,
    CustomerListComponent,
    Customer360Component,
    LoyaltyComponent,
    GiftVouchersComponent
  ],
  imports: [
    SharedModule,
    CustomersRoutingModule
  ]
})
export class CustomersModule { }
