import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-customers',
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss']
})
export class CustomersComponent implements OnInit {
  activeTab = 'list';
  selectedCustomer: any = null;

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path ?? '';
    if (path === 'loyalty') {
      this.activeTab = 'loyalty';
    }
  }

  view360(c: any): void {
    this.selectedCustomer = c;
    this.activeTab = '360';
  }
}

