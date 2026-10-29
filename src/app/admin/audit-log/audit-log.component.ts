import { Component, OnInit } from '@angular/core';
import { ReportsService } from '../../reports/services/reports.service';

@Component({
  selector: 'app-audit-log',
  templateUrl: './audit-log.component.html',
  styleUrls: ['./audit-log.component.scss']
})
export class AuditLogComponent implements OnInit {
  logs: any[] = [];

  constructor(private reportsService: ReportsService) {}

  ngOnInit(): void {
    this.reportsService.getAuditLog().subscribe((res: any) => this.logs = res?.data ?? res ?? []);
  }
}
