import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { PosRoutingModule } from './pos-routing.module';
import { PosComponent } from './pos.component';
import { PosScreenComponent } from './pos-screen/pos-screen.component';
import { ProductGridComponent } from './product-grid/product-grid.component';
import { CartPanelComponent } from './cart-panel/cart-panel.component';
import { PaymentModalComponent } from './payment-modal/payment-modal.component';
import { ReturnsComponent } from './returns/returns.component';

@NgModule({
  declarations: [
    PosComponent,
    PosScreenComponent,
    ProductGridComponent,
    CartPanelComponent,
    PaymentModalComponent,
    ReturnsComponent
  ],
  imports: [
    SharedModule,
    PosRoutingModule
  ]
})
export class PosModule { }
