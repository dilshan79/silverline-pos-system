import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';

export interface TableColumn {
  key: string;
  label: string;
  type?: 'text' | 'badge' | 'currency' | 'date';
  badgeMap?: Record<string, string>;
}

@Component({
  selector: 'app-data-table',
  templateUrl: './data-table.component.html',
  styleUrls: ['./data-table.component.scss']
})
export class DataTableComponent implements OnChanges {
  @Input() columns: TableColumn[] = [];
  @Input() rows: any[] = [];
  @Input() searchKey = '';
  @Input() loading = false;

  filtered: any[] = [];
  search = '';

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['rows']) this.applyFilter();
  }

  applyFilter(): void {
    const q = this.search.toLowerCase();
    this.filtered = q && this.searchKey
      ? this.rows.filter(r => String(r[this.searchKey] ?? '').toLowerCase().includes(q))
      : [...this.rows];
  }

  getValue(row: any, key: string): any {
    return key.split('.').reduce((o, k) => o?.[k], row);
  }
}
