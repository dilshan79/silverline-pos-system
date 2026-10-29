import { Component, Output, EventEmitter, OnInit } from '@angular/core';

@Component({
  selector: 'app-report-filter',
  templateUrl: './report-filter.component.html',
  styleUrls: ['./report-filter.component.scss']
})
export class ReportFilterComponent implements OnInit {
  fromDate = '';
  toDate = '';
  location = 'ALL';
  @Output() filterApplied = new EventEmitter<any>();

  ngOnInit(): void {
    const today = new Date();
    this.toDate = today.toISOString().split('T')[0];
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    this.fromDate = monthStart.toISOString().split('T')[0];
  }

  setPreset(preset: 'today' | 'week' | 'month' | 'year'): void {
    const now = new Date();
    this.toDate = now.toISOString().split('T')[0];
    if (preset === 'today') {
      this.fromDate = this.toDate;
    } else if (preset === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      this.fromDate = d.toISOString().split('T')[0];
    } else if (preset === 'month') {
      this.fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    } else if (preset === 'year') {
      this.fromDate = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    }
    this.apply();
  }

  apply(): void {
    this.filterApplied.emit({ fromDate: this.fromDate, toDate: this.toDate, location: this.location });
  }
}
