import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-job-detail',
  templateUrl: './job-detail.component.html',
  styleUrls: ['./job-detail.component.scss']
})
export class JobDetailComponent {
  @Input() jobNo = 'JOB-2026-001';

  job = {
    jobNo: 'JOB-2026-001',
    customerName: 'Kasun Perera',
    customerPhone: '0771234567',
    device: 'iPhone 11 64GB',
    issue: 'Cracked screen, touch non-responsive',
    status: 'In Progress',
    technician: 'Tech Ruwan',
    estimate: 18500
  };
}
