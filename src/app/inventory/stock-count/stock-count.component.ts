import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Category } from '../../core/models';

interface AuditLine {
  code: string;
  name: string;
  category: string;
  systemStock: number;
  physicalCount: number;
  variance: number;
  cost: number;
  costImpact: number;
  reason: string;
}

@Component({
  selector: 'app-stock-count',
  templateUrl: './stock-count.component.html',
  styleUrls: ['./stock-count.component.scss']
})
export class StockCountComponent implements OnInit {
  activeSubTab: 'audit' | 'history' = 'audit';

  auditLines: AuditLine[] = [];
  filteredLines: AuditLine[] = [];
  categories: Category[] = [];
  auditHistory: any[] = [];

  selectedCategory: string = 'All';
  selectedLocation: string = 'MW';
  searchTerm: string = '';
  auditedBy: string = 'Admin';

  loading: boolean = false;
  isSaving: boolean = false;
  successMsg: string = '';
  errorMsg: string = '';

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadAuditItems();
    this.loadAuditHistory();
  }

  loadCategories(): void {
    this.inventoryService.getCategories().subscribe({
      next: (cats) => this.categories = cats,
      error: (err) => console.warn('Could not load categories', err)
    });
  }

  loadAuditItems(): void {
    this.loading = true;
    this.errorMsg = '';
    this.inventoryService.getItems().subscribe({
      next: (items) => {
        this.auditLines = items.map(i => {
          const st = parseInt((i.stock || 0).toString(), 10);
          const cost = parseFloat((i.cost || 0).toString());
          return {
            code: i.code,
            name: i.name,
            category: i.category || i.categoryName || 'General',
            systemStock: st,
            physicalCount: st,
            variance: 0,
            cost: cost,
            costImpact: 0,
            reason: 'Physical Audit Match'
          };
        });
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load items for audit: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  loadAuditHistory(): void {
    this.inventoryService.getStockAudits().subscribe({
      next: (rows) => this.auditHistory = rows,
      error: (err) => console.warn('Could not load audit history', err)
    });
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredLines = this.auditLines.filter(line => {
      if (this.selectedCategory !== 'All' && line.category !== this.selectedCategory) return false;
      if (term) {
        const matchCode = line.code.toLowerCase().includes(term);
        const matchName = line.name.toLowerCase().includes(term);
        if (!matchCode && !matchName) return false;
      }
      return true;
    });
  }

  onFilterChange(): void {
    this.applyFilter();
  }

  onCountChange(line: AuditLine): void {
    const phys = parseInt((line.physicalCount || 0).toString(), 10);
    line.physicalCount = isNaN(phys) ? 0 : phys;
    line.variance = line.physicalCount - line.systemStock;
    line.costImpact = Math.round(line.variance * line.cost * 100) / 100;
    if (line.variance !== 0 && line.reason === 'Physical Audit Match') {
      line.reason = line.variance < 0 ? 'Shortage / Shrinkage' : 'Excess / Found in Drawer';
    } else if (line.variance === 0) {
      line.reason = 'Physical Audit Match';
    }
  }

  setMatchAll(): void {
    this.filteredLines.forEach(l => {
      l.physicalCount = l.systemStock;
      this.onCountChange(l);
    });
  }

  getDiscrepancyCount(): number {
    return this.auditLines.filter(l => l.variance !== 0).length;
  }

  getTotalNetVariance(): number {
    return this.auditLines.reduce((sum, l) => sum + l.variance, 0);
  }

  getTotalCostImpact(): number {
    return this.auditLines.reduce((sum, l) => sum + l.costImpact, 0);
  }

  saveAudit(): void {
    const discrepancies = this.auditLines.filter(l => l.variance !== 0);
    if (discrepancies.length === 0) {
      if (!confirm('All counts perfectly match system stock. Do you want to submit and record this zero-variance audit?')) {
        return;
      }
    } else {
      if (!confirm(`Save audit with ${discrepancies.length} discrepancy item(s)? This will update system inventory stock in the database.`)) {
        return;
      }
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.inventoryService.saveStockAudit({
      audits: this.auditLines,
      location_code: this.selectedLocation,
      audited_by: this.auditedBy
    }).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (res && res.status === 'success') {
          this.successMsg = `Stock audit ${res.audit_no} saved successfully! ${res.items_adjusted} item(s) updated in database.`;
          this.loadAuditItems();
          this.loadAuditHistory();
          setTimeout(() => this.successMsg = '', 5000);
        } else {
          alert(res?.message || 'Failed to save audit');
        }
      },
      error: (err) => {
        this.isSaving = false;
        alert('Error saving audit: ' + (err.error?.message || err.message));
      }
    });
  }
}
