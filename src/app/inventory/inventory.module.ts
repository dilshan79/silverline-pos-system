import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { InventoryRoutingModule } from './inventory-routing.module';
import { InventoryComponent } from './inventory.component';
import { ItemsComponent } from './items/items.component';
import { ItemFormComponent } from './items/item-form/item-form.component';
import { StockBalanceComponent } from './stock-balance/stock-balance.component';
import { ImeiLookupComponent } from './imei-lookup/imei-lookup.component';
import { StockCountComponent } from './stock-count/stock-count.component';
import { TransferOfGoodsComponent } from './transfer-of-goods/transfer-of-goods.component';

import { CategoriesComponent } from './categories/categories.component';
import { SubcategoriesComponent } from './subcategories/subcategories.component';

@NgModule({
  declarations: [
    InventoryComponent,
    ItemsComponent,
    ItemFormComponent,
    CategoriesComponent,
    SubcategoriesComponent,
    StockBalanceComponent,
    ImeiLookupComponent,
    StockCountComponent,
    TransferOfGoodsComponent
  ],
  imports: [
    SharedModule,
    InventoryRoutingModule
  ]
})
export class InventoryModule { }
