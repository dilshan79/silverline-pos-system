import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Item, Category, Subcategory } from '../../core/models';

@Component({
  selector: 'app-items',
  templateUrl: './items.component.html',
  styleUrls: ['./items.component.scss']
})
export class ItemsComponent implements OnInit {
  items: Item[] = [];
  filteredItems: Item[] = [];
  categories: Category[] = [];
  allSubcategories: Subcategory[] = [];
  filteredSubcategoriesForFilter: Subcategory[] = [];

  // Filter controls
  searchTerm: string = '';
  selectedCategory: string = 'All';
  selectedSubcategory: string = 'All';

  loading: boolean = false;
  successMsg: string = '';
  errorMsg: string = '';

  // Modal
  showForm: boolean = false;
  selectedItem: Item = this.getEmptyItem();

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadMeta();
    this.loadItems();
  }

  getEmptyItem(): Item {
    const firstCat = this.categories[0]?.name || 'Phones';
    return {
      code: '',
      name: '',
      categoryName: firstCat,
      category: firstCat,
      subcategory: '',
      cost: 0,
      price: 0,
      stock: 0,
      trackImei: false,
      status: 'Active'
    };
  }

  loadMeta(): void {
    this.inventoryService.getCategories().subscribe({
      next: (cats) => this.categories = cats,
      error: (err) => console.warn('Could not load categories', err)
    });

    this.inventoryService.getSubcategories().subscribe({
      next: (subcats) => {
        this.allSubcategories = subcats;
        this.updateSubcategoriesForFilter();
      },
      error: (err) => console.warn('Could not load subcategories', err)
    });
  }

  loadItems(): void {
    this.loading = true;
    this.errorMsg = '';
    this.inventoryService.getItems().subscribe({
      next: (data) => {
        this.items = data.map(i => ({
          ...i,
          cost: parseFloat((i.cost || 0).toString()),
          price: parseFloat((i.price || 0).toString()),
          stock: parseInt((i.stock || 0).toString(), 10),
          categoryName: i.category || i.categoryName || 'General',
          subcategory: i.subcategory || '',
          trackImei: i.track_imei === 1 || i.trackImei === true
        }));
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load items: ' + (err.message || 'Unknown error');
        this.loading = false;
      }
    });
  }

  onCategoryFilterChange(): void {
    this.updateSubcategoriesForFilter();
    this.selectedSubcategory = 'All';
    this.applyFilter();
  }

  updateSubcategoriesForFilter(): void {
    if (this.selectedCategory === 'All') {
      this.filteredSubcategoriesForFilter = [...this.allSubcategories];
    } else {
      this.filteredSubcategoriesForFilter = this.allSubcategories.filter(sc => sc.category_name === this.selectedCategory);
    }
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    this.filteredItems = this.items.filter(item => {
      // Category filter
      if (this.selectedCategory !== 'All') {
        const cat = item.category || item.categoryName;
        if (cat !== this.selectedCategory) return false;
      }
      // Subcategory filter
      if (this.selectedSubcategory !== 'All') {
        if (item.subcategory !== this.selectedSubcategory) return false;
      }
      // Text search
      if (term) {
        const codeMatch = item.code.toLowerCase().includes(term);
        const nameMatch = item.name.toLowerCase().includes(term);
        const subMatch = (item.subcategory || '').toLowerCase().includes(term);
        if (!codeMatch && !nameMatch && !subMatch) return false;
      }
      return true;
    });
  }

  openCreate(): void {
    this.selectedItem = this.getEmptyItem();
    this.showForm = true;
  }

  openEdit(item: Item): void {
    this.selectedItem = {
      ...item,
      categoryName: item.category || item.categoryName || 'General',
      category: item.category || item.categoryName || 'General'
    };
    this.showForm = true;
  }

  saveItem(item: Item): void {
    this.inventoryService.saveItem(item).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.successMsg = `Item "${item.name}" (${item.code}) saved successfully!`;
          this.showForm = false;
          this.loadItems();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to save item');
        }
      },
      error: (err) => {
        alert('Error saving item: ' + (err.error?.message || err.message));
      }
    });
  }

  deleteItem(item: Item): void {
    if (!confirm(`Are you sure you want to delete item "${item.name}" (${item.code})?`)) {
      return;
    }

    const idOrCode = item.id || item.code;
    this.inventoryService.deleteItem(idOrCode).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.successMsg = `Item "${item.name}" deleted successfully.`;
          this.loadItems();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to delete item');
        }
      },
      error: (err) => {
        alert('Error deleting item: ' + (err.error?.message || err.message));
      }
    });
  }
}
