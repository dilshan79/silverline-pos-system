import { Component } from '@angular/core';

@Component({
  selector: 'app-purchase-return',
  templateUrl: './purchase-return.component.html',
  styleUrls: ['./purchase-return.component.scss']
})
export class PurchaseReturnComponent {
  returns = [
    { returnNo: 'PR-2026-001', supplier: 'Softlogic Retail', grnNo: 'GRN-2026-001', reason: 'Damaged Packaging', date: '2026-09-30' }
  ];
}
