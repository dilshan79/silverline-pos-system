import { Component } from '@angular/core';

@Component({
  selector: 'app-grn',
  templateUrl: './grn.component.html',
  styleUrls: ['./grn.component.scss']
})
export class GrnComponent {
  grnList = [
    { grnNo: 'GRN-2026-001', poNo: 'PO-2026-001', supplier: 'Softlogic Retail', receivedDate: '2026-09-30', status: 'Received' }
  ];
  scanning = false;
}
