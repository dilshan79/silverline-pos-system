import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Item } from '../../core/models';

interface ManifestItem {
  code: string;
  name: string;
  category: string;
  qty: number;
  imei?: string;
  unit_cost: number;
  unit_price: number;
}

@Component({
  selector: 'app-transfer-of-goods',
  templateUrl: './transfer-of-goods.component.html',
  styleUrls: ['./transfer-of-goods.component.scss']
})
export class TransferOfGoodsComponent implements OnInit {
  activeSubTab: 'new' | 'history' = 'new';

  locations: any[] = [];
  catalogItems: Item[] = [];
  availableImeis: any[] = [];
  filteredImeisForSelected: any[] = [];

  // Transfer Form State
  fromLoc: string = 'MW';
  toLoc: string = 'SH';
  notes: string = '';
  createdBy: string = 'Admin';

  // Staging Item Inputs
  selectedItemCode: string = '';
  selectedItemStock: number = 0;
  transferQty: number = 1;
  selectedImei: string = '';

  manifest: ManifestItem[] = [];
  transferHistory: any[] = [];

  loading: boolean = false;
  isDispatching: boolean = false;
  successMsg: string = '';
  errorMsg: string = '';

  // View / Print Slip Modal
  showSlipModal: boolean = false;
  activeSlip: any = null;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadLocations();
    this.loadCatalog();
    this.loadImeis();
    this.loadTransferHistory();
  }

  loadLocations(): void {
    this.inventoryService.getLocations().subscribe({
      next: (locs) => {
        this.locations = locs;
        if (locs.length >= 2) {
          this.fromLoc = locs[0].code;
          this.toLoc = locs[1].code;
        }
      },
      error: (err) => console.warn('Could not load locations', err)
    });
  }

  loadCatalog(): void {
    this.inventoryService.getItems().subscribe({
      next: (items) => {
        this.catalogItems = items;
        if (items.length > 0) {
          this.selectedItemCode = items[0].code;
          this.onItemSelect();
        }
      },
      error: (err) => console.warn('Could not load items', err)
    });
  }

  loadImeis(): void {
    this.inventoryService.getImeis({ status: 'In Stock' }).subscribe({
      next: (rows) => {
        this.availableImeis = rows;
        this.filterImeisForSelected();
      },
      error: (err) => console.warn('Could not load IMEIs', err)
    });
  }

  loadTransferHistory(): void {
    this.inventoryService.getStockTransfers().subscribe({
      next: (rows) => this.transferHistory = rows,
      error: (err) => console.warn('Could not load transfer history', err)
    });
  }

  onItemSelect(): void {
    const item = this.catalogItems.find(i => i.code === this.selectedItemCode);
    if (item) {
      this.selectedItemStock = item.stock || 0;
      this.transferQty = 1;
      this.filterImeisForSelected();
    }
  }

  filterImeisForSelected(): void {
    const item = this.catalogItems.find(i => i.code === this.selectedItemCode);
    if (item && (item.trackImei || (item as any).track_imei == 1)) {
      this.filteredImeisForSelected = this.availableImeis.filter(
        im => im.item_code === this.selectedItemCode && im.location_code === this.fromLoc
      );
      this.selectedImei = this.filteredImeisForSelected[0]?.imei_number || '';
    } else {
      this.filteredImeisForSelected = [];
      this.selectedImei = '';
    }
  }

  onFromLocationChange(): void {
    if (this.fromLoc === this.toLoc) {
      // Pick another destination
      const other = this.locations.find(l => l.code !== this.fromLoc);
      if (other) this.toLoc = other.code;
    }
    this.filterImeisForSelected();
  }

  addToManifest(): void {
    const item = this.catalogItems.find(i => i.code === this.selectedItemCode);
    if (!item) return;

    if (this.transferQty <= 0) {
      alert('Transfer quantity must be at least 1.');
      return;
    }

    if (this.transferQty > this.selectedItemStock) {
      alert(`Cannot transfer ${this.transferQty} units. Available stock at branch is only ${this.selectedItemStock}.`);
      return;
    }

    // Check if serialized and already in manifest
    if (this.selectedImei) {
      const imeiExists = this.manifest.some(m => m.imei === this.selectedImei);
      if (imeiExists) {
        alert(`IMEI ${this.selectedImei} is already added to this transfer manifest.`);
        return;
      }
    }

    this.manifest.push({
      code: item.code,
      name: item.name,
      category: item.category || item.categoryName || 'General',
      qty: this.transferQty,
      imei: this.selectedImei || undefined,
      unit_cost: parseFloat((item.cost || 0).toString()),
      unit_price: parseFloat((item.price || 0).toString())
    });

    this.transferQty = 1;
    this.selectedImei = '';
  }

  removeFromManifest(index: number): void {
    this.manifest.splice(index, 1);
  }

  getTotalManifestUnits(): number {
    return this.manifest.reduce((sum, itm) => sum + itm.qty, 0);
  }

  getTotalManifestCost(): number {
    return this.manifest.reduce((sum, itm) => sum + (itm.qty * itm.unit_cost), 0);
  }

  dispatchTransfer(): void {
    if (this.manifest.length === 0) {
      alert('Please add at least one item to the transfer manifest.');
      return;
    }

    if (this.fromLoc === this.toLoc) {
      alert('Source and destination branches cannot be the same.');
      return;
    }

    if (!confirm(`Dispatch transfer of ${this.getTotalManifestUnits()} unit(s) from ${this.fromLoc} to ${this.toLoc}?`)) {
      return;
    }

    this.isDispatching = true;
    this.errorMsg = '';
    this.inventoryService.createStockTransfer({
      from_location: this.fromLoc,
      to_location: this.toLoc,
      items: this.manifest,
      notes: this.notes,
      created_by: this.createdBy
    }).subscribe({
      next: (res) => {
        this.isDispatching = false;
        if (res && res.status === 'success') {
          this.successMsg = `Stock transfer ${res.transfer_no} dispatched successfully!`;
          // Open print slip
          this.activeSlip = {
            transfer_no: res.transfer_no,
            from_location: this.fromLoc,
            from_location_name: this.getLocationName(this.fromLoc),
            to_location: this.toLoc,
            to_location_name: this.getLocationName(this.toLoc),
            created_at: new Date(),
            created_by: this.createdBy,
            notes: this.notes,
            total_qty: res.total_qty,
            items: [...this.manifest]
          };
          this.showSlipModal = true;

          // Clear manifest and reload data
          this.manifest = [];
          this.notes = '';
          this.loadCatalog();
          this.loadImeis();
          this.loadTransferHistory();
          setTimeout(() => this.successMsg = '', 5000);
        } else {
          alert(res?.message || 'Failed to dispatch transfer');
        }
      },
      error: (err) => {
        this.isDispatching = false;
        alert('Error dispatching transfer: ' + (err.error?.message || err.message));
      }
    });
  }

  getLocationName(code: string): string {
    const loc = this.locations.find(l => l.code === code);
    return loc ? loc.name : code;
  }

  openSlipModal(transfer: any): void {
    this.activeSlip = {
      ...transfer,
      from_location_name: transfer.from_location_name || this.getLocationName(transfer.from_location),
      to_location_name: transfer.to_location_name || this.getLocationName(transfer.to_location)
    };
    this.showSlipModal = true;
  }

  closeSlipModal(): void {
    this.showSlipModal = false;
    this.activeSlip = null;
  }

  printSlip(): void {
    window.print();
  }
}
