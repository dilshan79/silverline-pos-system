import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { ReportsService } from '../services/reports.service';

@Component({
  selector: 'app-report-viewer',
  templateUrl: './report-viewer.component.html',
  styleUrls: ['./report-viewer.component.scss']
})
export class ReportViewerComponent implements OnChanges {
  @Input() reportType = 'sales';
  @Input() filter: { fromDate: string; toDate: string; location?: string } | null = null;

  reportData: any = null;
  isLoading = false;
  errorMessage = '';

  // Default: current month
  private today = new Date().toISOString().split('T')[0];
  private monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

  constructor(private reportsService: ReportsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    this.loadReport();
  }

  loadReport(): void {
    const from = this.filter?.fromDate || this.monthStart;
    const to = this.filter?.toDate || this.today;
    this.isLoading = true;
    this.errorMessage = '';

    const handleRes = (res: any) => {
      this.isLoading = false;
      if (res && res.status === 'success') {
        this.reportData = res.data;
      } else if (res && res.data) {
        this.reportData = res.data;
      } else {
        this.reportData = res;
      }
    };

    const handleErr = (err: any) => {
      this.isLoading = false;
      this.errorMessage = 'Could not load report data from server.';
      console.warn('Report fetch failed', err);
    };

    switch (this.reportType) {
      case 'sales':
        this.reportsService.getSalesSummary(from, to).subscribe({ next: handleRes, error: handleErr });
        break;
      case 'inventory':
      case 'stock':
        this.reportsService.getStockReport().subscribe({ next: handleRes, error: handleErr });
        break;
      case 'pnl':
      case 'profit':
        this.reportsService.getProfitLoss(from, to).subscribe({ next: handleRes, error: handleErr });
        break;
      case 'tax':
        this.reportsService.getTaxReport(from, to).subscribe({ next: handleRes, error: handleErr });
        break;
      case 'top-items':
        this.reportsService.getTopItems(from, to).subscribe({ next: handleRes, error: handleErr });
        break;
      default:
        this.reportsService.getSalesSummary(from, to).subscribe({ next: handleRes, error: handleErr });
    }
  }

  getReportTitle(): string {
    switch (this.reportType) {
      case 'sales': return 'Sales Performance Summary';
      case 'inventory':
      case 'stock': return 'Inventory Valuation & Stock Levels';
      case 'pnl':
      case 'profit': return 'Profit & Loss Statement';
      case 'tax': return 'Tax & VAT Statutory Report (18%)';
      case 'top-items': return 'Top Selling Products';
      default: return 'Report Details';
    }
  }

  printReport(): void {
    window.print();
  }

  exportCsv(): void {
    if (!this.reportData || !this.reportData.data || this.reportData.data.length === 0) {
      alert('No data to export.');
      return;
    }
    const rows = this.reportData.data;
    const headers = Object.keys(rows[0]);
    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r: any) => headers.map(h => `"${(r[h] !== null && r[h] !== undefined) ? r[h] : ''}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${this.reportType}_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
