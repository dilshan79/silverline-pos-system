import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-service',
  templateUrl: './service.component.html',
  styleUrls: ['./service.component.scss']
})
export class ServiceComponent implements OnInit {
  activeTab = 'job-pool';
  selectedJobNo = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path ?? '';
    if (path === 'new') {
      this.activeTab = 'new-job';
    } else if (path === 'tech') {
      this.activeTab = 'tech';
    }
  }

  viewJobDetail(jobNo: string): void {
    this.selectedJobNo = jobNo;
    this.activeTab = 'job-detail';
  }
}

