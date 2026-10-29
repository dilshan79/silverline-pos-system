import { Component, OnInit } from '@angular/core';
import { InventoryService } from '../services/inventory.service';
import { Category } from '../../core/models';

@Component({
  selector: 'app-categories',
  templateUrl: './categories.component.html',
  styleUrls: ['./categories.component.scss']
})
export class CategoriesComponent implements OnInit {
  categories: Category[] = [];
  filteredCategories: Category[] = [];
  searchTerm: string = '';
  loading: boolean = false;
  errorMsg: string = '';
  successMsg: string = '';

  // Modal state
  showModal: boolean = false;
  editingCategory: { id?: number; name: string; description: string } = { name: '', description: '' };
  isSaving: boolean = false;

  constructor(private inventoryService: InventoryService) {}

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories(): void {
    this.loading = true;
    this.errorMsg = '';
    this.inventoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = data;
        this.applyFilter();
        this.loading = false;
      },
      error: (err) => {
        this.errorMsg = 'Failed to load categories: ' + (err.message || 'Unknown error');
        this.loading = false;
      }
    });
  }

  applyFilter(): void {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) {
      this.filteredCategories = [...this.categories];
    } else {
      this.filteredCategories = this.categories.filter(c =>
        c.name.toLowerCase().includes(term) || (c.description && c.description.toLowerCase().includes(term))
      );
    }
  }

  openCreate(): void {
    this.editingCategory = { name: '', description: '' };
    this.errorMsg = '';
    this.successMsg = '';
    this.showModal = true;
  }

  openEdit(cat: Category): void {
    this.editingCategory = { id: cat.id, name: cat.name, description: cat.description || '' };
    this.errorMsg = '';
    this.successMsg = '';
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
  }

  saveCategory(): void {
    const name = this.editingCategory.name.trim();
    if (!name) {
      alert('Category name is required.');
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.inventoryService.saveCategory(this.editingCategory).subscribe({
      next: (res) => {
        this.isSaving = false;
        if (res && res.status === 'success') {
          this.successMsg = `Category "${name}" saved successfully!`;
          this.closeModal();
          this.loadCategories();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          this.errorMsg = res?.message || 'Failed to save category';
        }
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = 'Error saving category: ' + (err.error?.message || err.message);
      }
    });
  }

  deleteCategory(cat: Category): void {
    if ((cat.item_count || 0) > 0) {
      alert(`Cannot delete category "${cat.name}" because it currently has ${cat.item_count} item(s) assigned to it. Please reassign or delete the items first.`);
      return;
    }

    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) {
      return;
    }

    if (!cat.id) return;

    this.inventoryService.deleteCategory(cat.id).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.successMsg = `Category "${cat.name}" deleted successfully.`;
          this.loadCategories();
          setTimeout(() => this.successMsg = '', 4000);
        } else {
          alert(res?.message || 'Failed to delete category');
        }
      },
      error: (err) => {
        alert('Error deleting category: ' + (err.error?.message || err.message));
      }
    });
  }
}
