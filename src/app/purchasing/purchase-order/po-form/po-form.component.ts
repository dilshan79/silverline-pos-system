import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-po-form',
  templateUrl: './po-form.component.html',
  styleUrls: ['./po-form.component.scss']
})
export class PoFormComponent {
  @Input() visible = false;
  @Output() saved = new EventEmitter<any>();
  @Output() cancelled = new EventEmitter<void>();

  supplier = '';
  items = [{ code: '', qty: 1, cost: 0 }];

  addItem(): void {
    this.items.push({ code: '', qty: 1, cost: 0 });
  }

  save(): void {
    this.saved.emit({ supplier: this.supplier, items: this.items });
  }
}
