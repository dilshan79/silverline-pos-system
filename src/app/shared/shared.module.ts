import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { CurrencyLkrPipe } from './pipes/currency-lkr.pipe';
import { DateFormatPipe } from './pipes/date-format.pipe';
import { PermissionDirective } from './directives/permission.directive';
import { DataTableComponent } from './components/data-table/data-table.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { StatusBadgeComponent } from './components/status-badge/status-badge.component';
import { LoadingSpinnerComponent } from './components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from './components/empty-state/empty-state.component';
import { KpiCardComponent } from './components/kpi-card/kpi-card.component';
import { PageHeaderComponent } from './components/page-header/page-header.component';

const COMPONENTS = [
  DataTableComponent,
  ConfirmDialogComponent,
  StatusBadgeComponent,
  LoadingSpinnerComponent,
  EmptyStateComponent,
  KpiCardComponent,
  PageHeaderComponent
];

const PIPES = [CurrencyLkrPipe, DateFormatPipe];
const DIRECTIVES = [PermissionDirective];

@NgModule({
  declarations: [...COMPONENTS, ...PIPES, ...DIRECTIVES],
  imports: [CommonModule, FormsModule, RouterModule],
  exports: [CommonModule, FormsModule, RouterModule, ...COMPONENTS, ...PIPES, ...DIRECTIVES]
})
export class SharedModule {}
