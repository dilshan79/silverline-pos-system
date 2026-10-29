import { Component } from '@angular/core';

@Component({
  selector: 'app-vouchers',
  templateUrl: './vouchers.component.html',
  styleUrls: ['./vouchers.component.scss']
})
export class VouchersComponent {
  vouchers = [
    { voucherNo: 'JV-2026-001', date: '2026-09-30', type: 'Journal', debit: 25000, credit: 25000, memo: 'Office Supplies Expense' }
  ];
}
