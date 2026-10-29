import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Category } from '../../core/models';

@Component({
  selector: 'app-stock-balance',
  templateUrl: './stock-balance.component.html',
  styleUrls: ['./stock-balance.component.scss']
})
export class StockBalanceComponent implements OnInit {
  items: any[] = [];
  categories: Category[] = [];
  summary: any = {
    totalItems: 0,
    totalUnits: 0,
    totalCostValue: 0,
    totalRetailValue: 0,
    potentialProfit: 0,
    lowStockCount: 0,
    outOfStockCount: 0
  };

  searchTerm: string = '';
  selectedCategory: string = 'All';
  selectedStockStatus: string = 'All';
  loading: boolean = false;
  successMsg: string = '';
  errorMsg: string = '';

  // Quick Adjust Modal
  showAdjustModal: boolean = false;
  adjustingItem: any = null;
  adjustNewStock: number = 0;
  adjustReason: string = 'Manual Stock Adjustment';
  adjusting: boolean = false;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadStockBalance();
  }

  loadCategories(): void {
    this.inventoryService.getCategories().subscribe({
      next: (cats) => this.categories = cats,
      error: (err) => console.warn('Could not load categories', err)
    });
  }

  loadStockBalance(): void {
    this.loading = true;
    this.errorMsg = '';
    const filters = {
      search: this.searchTerm.trim() || undefined,
      category: this.selectedCategory !== 'All' ? this.selectedCategory : undefined,
      stock_status: this.selectedStockStatus !== 'All' ? this.selectedStockStatus : undefined
    };

    this.inventoryService.getStockBalance(filters).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.items = res.data || [];
          this.summary = res.summary || this.summary;
        } else {
          this.errorMsg = res?.message || 'Failed to load stock balance';
        }
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Error loading stock: ' + (err.error?.message || err.message);
        this.loading = false;
      }
    });
  }

  onFilterChange(): void {
    this.loadStockBalance();
  }

  openAdjustModal(item: any): void {
    this.adjustingItem = item;
    this.adjustNewStock = item.stock;
    this.adjustReason = 'Physical Count Adjustment';
    this.showAdjustModal = true;
  }

  closeAdjustModal(): void {
    this.showAdjustModal = false;
    this.adjustingItem = null;
  }

  submitAdjustment(): void {
    if (!this.adjustingItem) return;
    this.adjusting = true;

    this.inventoryService.adjustStock({
      code: this.adjustingItem.code,
      new_stock: this.adjustNewStock,
      reason: this.adjustReason,
      user: 'Admin'
    }).subscribe({
      next: (res) => {
        this.adjusting = false;
        if (res && res.status === 'success') {
          this.successMsg = `Stock for ${this.adjustingItem.name} updated to ${this.adjustNewStock}!`;
          this.closeAdjustModal();
          this.loadStockBalance();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to adjust stock');
        }
      },
      error: (err) => {
        this.adjusting = false;
        alert('Error adjusting stock: ' + (err.error?.message || err.message));
      }
    });
  }
}
