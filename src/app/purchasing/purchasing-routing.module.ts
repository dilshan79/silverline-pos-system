import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PurchasingComponent } from './purchasing.component';

const routes: Routes = [
  { path: '', component: PurchasingComponent },
  { path: 'grn', component: PurchasingComponent },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PurchasingRoutingModule { }

