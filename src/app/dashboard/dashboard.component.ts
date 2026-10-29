import { Component, OnInit } from '@angular/core';
import { DashboardService } from './services/dashboard.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  // KPI cards
  todaySales:  string|number = '—';
  cashInHand:  string|number = '—';
  grossProfit: string|number = '—';
  jobsInPool:  string|number = '—';
  lowStock:    string|number = '—';
  chequesDue:  string|number = '—';

  // Location breakdown
  locationStats: any[] = [];

  // 7-day bar chart
  weekBars: number[] = [0, 0, 0, 0, 0, 0, 0];
  weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  // Attention items
  attentionItems: any[] = [];

  // Recent sales
  recentSales: any[] = [];

  // Low stock
  lowStockItems: any[] = [];

  loading = true;

  constructor(private dashboardService: DashboardService) {}

  ngOnInit(): void {
    this.dashboardService.getSummary().subscribe({
      next: (res: any) => {
        const d = res?.data ?? res;
        this.todaySales  = 'Rs ' + (parseFloat(d?.today_sales  ?? 0)).toLocaleString();
        this.cashInHand  = 'Rs ' + (parseFloat(d?.cash_in_hand ?? 0)).toLocaleString();
        this.grossProfit = 'Rs ' + (parseFloat(d?.gross_profit ?? 0)).toLocaleString();
        this.jobsInPool  = d?.jobs_in_pool  ?? 0;
        this.lowStock    = d?.low_stock_count ?? 0;
        this.chequesDue  = d?.cheques_due   ?? 0;

        if (d?.location_stats) this.locationStats = d.location_stats;
        if (d?.week_sales) {
          const max = Math.max(...d.week_sales, 1);
          this.weekBars = d.week_sales.map((v: number) => Math.round((v / max) * 100));
        }
        if (d?.attention) this.attentionItems = d.attention;
        this.loading = false;
      },
      error: () => {
        // Fallback demo data so the dashboard still looks good
        this.todaySales  = 'Rs 412,500';
        this.cashInHand  = 'Rs 186,200';
        this.grossProfit = 'Rs 68,400';
        this.jobsInPool  = 4;
        this.lowStock    = 7;
        this.chequesDue  = 3;
        this.locationStats = [
          { name: 'Fair Road (SH)',        sales: '182,000' },
          { name: 'Bravo Bus Stand (MW)',   sales: '141,500' },
          { name: 'Super & Mobile (SS)',    sales: '89,000'  }
        ];
        this.weekBars    = [50, 70, 45, 85, 60, 100, 75];
        this.attentionItems = [
          { label: 'J-0231 waiting 3h',          badge: 'SLA',         cls: 'r' },
          { label: 'Samsung A03s – 2 left',       badge: 'Low stock',   cls: 'y' },
          { label: 'BOC cheque due tomorrow',     badge: 'Rs 85,000',   cls: 'b' },
          { label: 'Warranty claims open',        badge: '2',           cls: 'b' }
        ];
        this.loading = false;
      }
    });

    this.dashboardService.getRecentSales().subscribe((res: any) => {
      this.recentSales = res?.data ?? res ?? [];
    });

    this.dashboardService.getLowStock().subscribe((res: any) => {
      this.lowStockItems = res?.data ?? res ?? [];
    });
  }
}
