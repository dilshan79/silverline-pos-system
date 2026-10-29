import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ReportsRoutingModule } from './reports-routing.module';
import { ReportsComponent } from './reports.component';
import { ReportViewerComponent } from './report-viewer/report-viewer.component';
import { ReportFilterComponent } from './report-filter/report-filter.component';

@NgModule({
  declarations: [
    ReportsComponent,
    ReportViewerComponent,
    ReportFilterComponent
  ],
  imports: [
    SharedModule,
    ReportsRoutingModule
  ]
})
export class ReportsModule { }
