import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-payment-modal',
  templateUrl: './payment-modal.component.html',
  styleUrls: ['./payment-modal.component.scss']
})
export class PaymentModalComponent {
  @Input() total = 0;
  @Input() visible = false;
  @Output() completed = new EventEmitter<{ method: string; tendered: number }>();
  @Output() cancelled = new EventEmitter<void>();

  paymentMethod = 'Cash';
  tendered = 0;

  get balance(): number {
    return Math.max(0, this.tendered - this.total);
  }

  submitPayment(): void {
    if (this.paymentMethod === 'Cash' && this.tendered < this.total) {
      alert('Tendered amount is less than total amount!');
      return;
    }
    this.completed.emit({
      method: this.paymentMethod,
      tendered: this.paymentMethod === 'Cash' ? this.tendered : this.total
    });
  }
}
