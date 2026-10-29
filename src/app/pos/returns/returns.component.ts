import { Component } from '@angular/core';

@Component({
  selector: 'app-returns',
  templateUrl: './returns.component.html',
  styleUrls: ['./returns.component.scss']
})
export class ReturnsComponent {
  searchQuery = 'INV-1042';
  returnType = 'Customer return';
  returnReason = 'Faulty';
  refundMethod = 'Cash';

  originalSales = [
    { invoice: 'INV-1042', date: '2026-09-10', item: 'Samsung A03s 64GB', imei: '35691…8821', price: 72900, warranty: '11 months left' }
  ];

  searchInvoice(): void {
    if (!this.searchQuery.trim()) return;
    alert(`Searching for invoice/IMEI/phone: ${this.searchQuery}`);
  }

  processReturn(): void {
    alert('Return processed successfully! IMEI restocked/RMA updated and credit note created.');
  }
}
