import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Item } from '../../core/models';

@Component({
  selector: 'app-imei-lookup',
  templateUrl: './imei-lookup.component.html',
  styleUrls: ['./imei-lookup.component.scss']
})
export class ImeiLookupComponent implements OnInit {
  imeis: any[] = [];
  filteredImeis: any[] = [];
  locations: any[] = [];
  trackedItems: Item[] = [];

  searchTerm: string = '';
  selectedStatus: string = 'All';
  selectedLocation: string = 'All';

  selectedImeiDetail: any = null;
  loading: boolean = false;
  successMsg: string = '';
  errorMsg: string = '';

  // Inward / Add IMEI Modal
  showAddModal: boolean = false;
  newImei: { item_code: string; imei_number: string; location_code: string; status: string } = {
    item_code: '',
    imei_number: '',
    location_code: 'MW',
    status: 'In Stock'
  };
  isSaving: boolean = false;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadLocations();
    this.loadTrackedItems();
    this.loadImeis();
  }

  loadLocations(): void {
    this.inventoryService.getLocations().subscribe({
      next: (locs) => this.locations = locs,
      error: (err) => console.warn('Could not load locations', err)
    });
  }

  loadTrackedItems(): void {
    this.inventoryService.getItems().subscribe({
      next: (items) => {
        this.trackedItems = items.filter(i => i.trackImei || (i as any).track_imei == 1);
        if (this.trackedItems.length > 0 && !this.newImei.item_code) {
          this.newImei.item_code = this.trackedItems[0].code;
        }
      },
      error: (err) => console.warn('Could not load items', err)
    });
  }

  loadImeis(): void {
    this.loading = true;
    this.errorMsg = '';
    const filters = {
      search: this.searchTerm.trim() || undefined,
      status: this.selectedStatus !== 'All' ? this.selectedStatus : undefined,
      location: this.selectedLocation !== 'All' ? this.selectedLocation : undefined
    };

    this.inventoryService.getImeis(filters).subscribe({
      next: (rows) => {
        this.imeis = rows;
        this.applyFilter();
        this.loading = false;

        // If searching a specific exact IMEI, auto-select it for detail view
        const term = this.searchTerm.trim();
        if (term && rows.length > 0) {
          const exact = rows.find(r => r.imei_number === term);
          if (exact) this.selectedImeiDetail = exact;
        }
      },
      error: (err) => {
        this.errorMsg = 'Failed to load IMEI records: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredImeis = this.imeis.filter(im => {
      if (this.selectedStatus !== 'All' && im.status !== this.selectedStatus) return false;
      if (this.selectedLocation !== 'All' && im.location_code !== this.selectedLocation) return false;
      if (term) {
        const matchImei = (im.imei_number || '').toLowerCase().includes(term);
        const matchCode = (im.item_code || '').toLowerCase().includes(term);
        const matchName = (im.item_name || '').toLowerCase().includes(term);
        const matchInv = (im.sold_invoice_no || '').toLowerCase().includes(term);
        if (!matchImei && !matchCode && !matchName && !matchInv) return false;
      }
      return true;
    });
  }

  onFilterChange(): void {
    this.loadImeis();
  }

  selectImei(im: any): void {
    this.selectedImeiDetail = im;
  }

  openAddModal(): void {
    const defaultCode = this.trackedItems[0]?.code || '';
    this.newImei = {
      item_code: defaultCode,
      imei_number: '',
      location_code: 'MW',
      status: 'In Stock'
    };
    this.showAddModal = true;
  }

  closeAddModal(): void {
    this.showAddModal = false;
  }

  saveImeiRecord(): void {
    const imei = this.newImei.imei_number.trim();
    if (!this.newImei.item_code) {
      alert('Please select an item model.');
      return;
    }
    if (!imei) {
      alert('Please enter an IMEI / Serial number.');
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.inventoryService.saveImei(this.newImei).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (res && res.status === 'success') {
          this.successMsg = `IMEI "${imei}" registered successfully!`;
          this.closeAddModal();
          this.loadImeis();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to save IMEI');
        }
      },
      error: (err) => {
        this.isSaving = false;
        alert('Error saving IMEI: ' + (err.error?.message || err.message));
      }
    });
  }

  updateImeiStatus(im: any, newStatus: string): void {
    if (!confirm(`Change status of IMEI ${im.imei_number} to "${newStatus}"?`)) return;

    this.inventoryService.saveImei({
      id: im.id,
      item_code: im.item_code,
      imei_number: im.imei_number,
      location_code: im.location_code,
      status: newStatus
    }).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          im.status = newStatus;
          if (this.selectedImeiDetail?.id === im.id) {
            this.selectedImeiDetail.status = newStatus;
          }
          this.successMsg = `IMEI status updated to ${newStatus}`;
          setTimeout(() => this.successMsg = '', 4000);
        }
      },
      error: (err) => alert('Failed to update status: ' + err.message)
    });
  }
}
