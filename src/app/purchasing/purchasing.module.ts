import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { PurchasingRoutingModule } from './purchasing-routing.module';
import { PurchasingComponent } from './purchasing.component';
import { PurchaseOrderComponent } from './purchase-order/purchase-order.component';
import { PoFormComponent } from './purchase-order/po-form/po-form.component';
import { GrnComponent } from './grn/grn.component';
import { GrnScanComponent } from './grn/grn-scan/grn-scan.component';
import { PurchaseReturnComponent } from './purchase-return/purchase-return.component';

@NgModule({
  declarations: [
    PurchasingComponent,
    PurchaseOrderComponent,
    PoFormComponent,
    GrnComponent,
    GrnScanComponent,
    PurchaseReturnComponent
  ],
  imports: [
    SharedModule,
    PurchasingRoutingModule
  ]
})
export class PurchasingModule { }
