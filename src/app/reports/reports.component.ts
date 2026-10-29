import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements OnInit {
  activeReport = 'sales';
  filterDates: { fromDate: string; toDate: string; location?: string } = {
    fromDate: '',
    toDate: ''
  };

  ngOnInit(): void {
    const today = new Date();
    const toDate = today.toISOString().split('T')[0];
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    this.filterDates = { fromDate, toDate, location: 'ALL' };
  }

  onFilterApplied(filter: any): void {
    if (filter) {
      this.filterDates = { ...filter };
    }
  }
}
