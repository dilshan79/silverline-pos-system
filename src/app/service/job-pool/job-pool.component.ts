import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { ServiceJobService } from '../services/service-job.service';
import { AdminService } from '../../admin/services/admin.service';

@Component({
  selector: 'app-job-pool',
  templateUrl: './job-pool.component.html',
  styleUrls: ['./job-pool.component.scss']
})
export class JobPoolComponent implements OnInit {
  @Output() selected = new EventEmitter<string>();

  jobs: any[] = [];
  technicians: any[] = [];
  assigningJob: any = null;
  selectedTech = '';

  constructor(
    private serviceJobService: ServiceJobService,
    private adminService: AdminService
  ) {}

  ngOnInit(): void {
    this.loadJobs();
    this.adminService.getUsers().subscribe((res: any) => {
      this.technicians = (res?.data ?? res ?? []).filter((u: any) => u.role === 'Technician');
    });
  }

  loadJobs(): void {
    this.serviceJobService.getJobs().subscribe((res: any) => {
      this.jobs = res?.data ?? res ?? [];
    });
  }

  getByStatus(status: string): any[] {
    return this.jobs.filter(j => j.status === status);
  }

  selectJob(jobNo: string): void {
    this.selected.emit(jobNo);
  }

  assignJob(job: any): void {
    this.assigningJob = job;
    this.selectedTech = '';
  }

  confirmAssign(): void {
    if (!this.selectedTech || !this.assigningJob) return;
    this.serviceJobService.updateStatus(this.assigningJob.id, 'In Progress', `Assigned to tech ${this.selectedTech}`)
      .subscribe(() => {
        this.assigningJob = null;
        this.loadJobs();
      });
  }

  updateStatus(job: any, status: string): void {
    this.serviceJobService.updateStatus(job.id, status).subscribe(() => this.loadJobs());
  }
}
