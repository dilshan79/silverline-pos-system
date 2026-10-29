import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Category, Subcategory } from '../../core/models';

@Component({
  selector: 'app-subcategories',
  templateUrl: './subcategories.component.html',
  styleUrls: ['./subcategories.component.scss']
})
export class SubcategoriesComponent implements OnInit {
  subcategories: Subcategory[] = [];
  filteredSubcategories: Subcategory[] = [];
  categories: Category[] = [];

  selectedCategoryFilter: string = 'All';
  searchTerm: string = '';
  loading: boolean = false;
  errorMsg: string = '';
  successMsg: string = '';

  // Modal
  showModal: boolean = false;
  editingSubcategory: { id?: number; category_name: string; name: string; description: string; category_id?: number } = {
    category_name: '',
    name: '',
    description: ''
  };
  isSaving: boolean = false;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadCategories();
    this.loadSubcategories();
  }

  loadCategories(): void {
    this.inventoryService.getCategories().subscribe({
      next: (data) => this.categories = data,
      error: (err) => console.warn('Could not load categories for dropdown', err)
    });
  }

  loadSubcategories(): void {
    this.loading = true;
    this.errorMsg = '';
    const cat = this.selectedCategoryFilter === 'All' ? undefined : this.selectedCategoryFilter;
    this.inventoryService.getSubcategories(cat).subscribe({
      next: (data) => {
        this.subcategories = data;
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load subcategories: ' + (err.message || 'Unknown error');
        this.loading = false;
      }
    });
  }

  onCategoryFilterChange(): void {
    this.loadSubcategories();
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredSubcategories = [...this.subcategories];
    } else {
      this.filteredSubcategories = this.subcategories.filter(sc =>
        sc.name.toLowerCase().includes(term) ||
        sc.category_name.toLowerCase().includes(term) ||
        (sc.description && sc.description.toLowerCase().includes(term))
      );
    }
  }

  openCreate(): void {
    const defaultCat = this.selectedCategoryFilter !== 'All' ? this.selectedCategoryFilter : (this.categories[0]?.name || 'Phones');
    this.editingSubcategory = { category_name: defaultCat, name: '', description: '' };
    this.errorMsg = '';
    this.successMsg = '';
    this.showModal = true;
  }

  openEdit(sc: Subcategory): void {
    this.editingSubcategory = {
      id: sc.id,
      category_id: sc.category_id,
      category_name: sc.category_name,
      name: sc.name,
      description: sc.description || ''
    };
    this.errorMsg = '';
    this.successMsg = '';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveSubcategory(): void {
    const name = this.editingSubcategory.name.trim();
    const catName = this.editingSubcategory.category_name.trim();

    if (!catName) {
      alert('Parent category is required.');
      return;
    }
    if (!name) {
      alert('Subcategory name is required.');
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.inventoryService.saveSubcategory(this.editingSubcategory).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (res && res.status === 'success') {
          this.successMsg = `Subcategory "${name}" saved under "${catName}"!`;
          this.closeModal();
          this.loadSubcategories();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          this.errorMsg = res?.message || 'Failed to save subcategory';
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = 'Error saving subcategory: ' + (err.error?.message || err.message);
      }
    });
  }

  deleteSubcategory(sc: Subcategory): void {
    if ((sc.item_count || 0) > 0) {
      alert(`Cannot delete subcategory "${sc.name}" because it currently has ${sc.item_count} item(s) assigned. Please reassign items first.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete subcategory "${sc.name}" in category "${sc.category_name}"?`)) {
      return;
    }

    if (!sc.id) return;

    this.inventoryService.deleteSubcategory(sc.id).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.successMsg = `Subcategory "${sc.name}" deleted successfully.`;
          this.loadSubcategories();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to delete subcategory');
        }
      },
      error: (err) => {
        alert('Error deleting subcategory: ' + (err.error?.message || err.message));
      }
    });
  }
}
