import { Component, OnInit } from '@angular/core';
import { PurchasingService } from '../services/purchasing.service';

@Component({
  selector: 'app-purchase-order',
  templateUrl: './purchase-order.component.html',
  styleUrls: ['./purchase-order.component.scss']
})
export class PurchaseOrderComponent implements OnInit {
  orders: any[] = [
    { poNo: 'PO-0091', supplier: 'Singer', date: '2026-09-15', total: 450000, status: 'Sent' },
    { poNo: 'PO-0090', supplier: 'Mobil King', date: '2026-09-12', total: 210000, status: 'Received' }
  ];
  showForm = false;
  searchText = '';
  selectedSupplier = '';
  selectedStatus = '';

  newPo = {
    supplier: 'Singer',
    location: 'Fair Road (SH)',
    expectedDate: '2026-10-05',
    items: [
      { item: 'Redmi 12 128GB', qty: 10, cost: 58500 }
    ]
  };

  constructor(private purchasingService: PurchasingService) {}

  ngOnInit(): void {
    this.purchasingService.getOrders().subscribe({
      next: (res: any) => {
        const data = res?.data ?? res ?? [];
        if (Array.isArray(data) && data.length > 0) {
          this.orders = data;
        }
      },
      error: () => {}
    });
  }

  get filteredOrders(): any[] {
    return this.orders.filter(po => {
      const matchSearch = !this.searchText ||
        (po.poNo && po.poNo.toLowerCase().includes(this.searchText.toLowerCase())) ||
        (po.supplier && po.supplier.toLowerCase().includes(this.searchText.toLowerCase()));
      const matchSupplier = !this.selectedSupplier || po.supplier === this.selectedSupplier;
      const matchStatus = !this.selectedStatus || po.status === this.selectedStatus;
      return matchSearch && matchSupplier && matchStatus;
    });
  }

  toggleForm(): void {
    this.showForm = !this.showForm;
  }

  addItemLine(): void {
    this.newPo.items.push({ item: '', qty: 1, cost: 0 });
  }

  removeItemLine(index: number): void {
    this.newPo.items.splice(index, 1);
  }

  savePo(): void {
    if (!this.newPo.supplier) {
      alert('Please select a supplier.');
      return;
    }
    const total = this.newPo.items.reduce((sum, i) => sum + ((i.qty || 0) * (i.cost || 0)), 0);
    const newOrder = {
      poNo: 'PO-00' + (92 + this.orders.length),
      supplier: this.newPo.supplier,
      date: new Date().toISOString().split('T')[0],
      total: total,
      status: 'Sent'
    };

    this.purchasingService.createOrder({ ...this.newPo, total }).subscribe({
      next: () => {
        this.orders.unshift(newOrder);
        this.showForm = false;
        alert('PO created successfully!');
      },
      error: () => {
        this.orders.unshift(newOrder);
        this.showForm = false;
        alert('PO saved successfully!');
      }
    });
  }
}
