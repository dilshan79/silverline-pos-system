import { Component } from '@angular/core';

@Component({
  selector: 'app-ar-ap-aging',
  templateUrl: './ar-ap-aging.component.html',
  styleUrls: ['./ar-ap-aging.component.scss']
})
export class ArApAgingComponent {
  receivables = [
    { entity: 'Customer A', current: 12000, days30: 5000, days60: 0, days90Plus: 0, total: 17000 }
  ];
  payables = [
    { entity: 'Softlogic Retail', current: 150000, days30: 100000, days60: 0, days90Plus: 0, total: 250000 }
  ];
}
