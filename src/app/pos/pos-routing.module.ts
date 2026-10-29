import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PosScreenComponent } from './pos-screen/pos-screen.component';
import { ReturnsComponent } from './returns/returns.component';

const routes: Routes = [
  { path: '', component: PosScreenComponent },
  { path: 'returns', component: ReturnsComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class PosRoutingModule { }
