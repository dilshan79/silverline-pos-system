import { Component } from '@angular/core';

@Component({
  selector: 'app-technician-app',
  templateUrl: './technician-app.component.html',
  styleUrls: ['./technician-app.component.scss']
})
export class TechnicianAppComponent {
  assignedJobs = [
    { jobNo: 'JOB-2026-002', customer: 'Nimal Silva', task: 'CCTV Camera Wiring', status: 'In Progress' }
  ];

  completeJob(jobNo: string): void {
    alert(`Job ${jobNo} marked as completed!`);
  }
}
