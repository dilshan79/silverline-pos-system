import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-grn-scan',
  templateUrl: './grn-scan.component.html',
  styleUrls: ['./grn-scan.component.scss']
})
export class GrnScanComponent {
  @Output() closed = new EventEmitter<void>();

  scannedImei = '';
  imeiList: string[] = [];

  addImei(): void {
    if (this.scannedImei.trim()) {
      this.imeiList.push(this.scannedImei.trim());
      this.scannedImei = '';
    }
  }

  finish(): void {
    alert(`Received ${this.imeiList.length} serialized items!`);
    this.closed.emit();
  }
}
