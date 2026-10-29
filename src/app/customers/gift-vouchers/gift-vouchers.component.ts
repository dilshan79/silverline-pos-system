import { Component } from '@angular/core';

@Component({
  selector: 'app-gift-vouchers',
  templateUrl: './gift-vouchers.component.html',
  styleUrls: ['./gift-vouchers.component.scss']
})
export class GiftVouchersComponent {
  vouchers = [
    { code: 'GV-5000-01', amount: 5000, issueDate: '2026-09-01', expiryDate: '2026-12-31', status: 'Active' }
  ];
}
