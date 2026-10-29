import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { Item, Category, Subcategory } from '../../../core/models';

@Component({
  selector: 'app-item-form',
  templateUrl: './item-form.component.html',
  styleUrls: ['./item-form.component.scss']
})
export class ItemFormComponent implements OnChanges {
  @Input() item: Item = {
    code: '',
    name: '',
    categoryName: 'Phones',
    category: 'Phones',
    subcategory: '',
    cost: 0,
    price: 0,
    stock: 0,
    trackImei: false,
    status: 'Active'
  };
  @Input() visible = false;
  @Input() categories: Category[] = [];
  @Input() allSubcategories: Subcategory[] = [];

  @Output() saved = new EventEmitter<Item>();
  @Output() cancelled = new EventEmitter<void>();

  filteredSubcategories: Subcategory[] = [];
  isSaving = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['item'] || changes['allSubcategories'] || changes['visible']) {
      this.syncCategoryAndFilterSubcategories();
    }
  }

  syncCategoryAndFilterSubcategories(): void {
    const activeCat = this.item.category || this.item.categoryName || '';
    if (activeCat) {
      this.filteredSubcategories = this.allSubcategories.filter(sc => sc.category_name === activeCat);
    } else {
      this.filteredSubcategories = [...this.allSubcategories];
    }
  }

  onCategoryChange(): void {
    this.item.category = this.item.categoryName;
    this.syncCategoryAndFilterSubcategories();
    // If the currently selected subcategory doesn't belong to the new category, reset it
    const exists = this.filteredSubcategories.some(sc => sc.name === this.item.subcategory);
    if (!exists) {
      this.item.subcategory = this.filteredSubcategories[0]?.name || '';
    }
  }

  generateCode(): void {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.item.code = '10' + randomSuffix;
  }

  getProfit(): number {
    return (this.item.price || 0) - (this.item.cost || 0);
  }

  getMarginPct(): number {
    if (!this.item.price || this.item.price <= 0) return 0;
    return Math.round((this.getProfit() / this.item.price) * 100);
  }

  submitForm(): void {
    const code = (this.item.code || '').trim();
    const name = (this.item.name || '').trim();
    const cat = (this.item.categoryName || this.item.category || '').trim();

    if (!code) {
      alert('Item code is required.');
      return;
    }
    if (!name) {
      alert('Item name is required.');
      return;
    }
    if (!cat) {
      alert('Category is required.');
      return;
    }

    this.item.code = code;
    this.item.name = name;
    this.item.category = cat;
    this.item.categoryName = cat;
    this.item.cost = parseFloat((this.item.cost || 0).toString());
    this.item.price = parseFloat((this.item.price || 0).toString());
    this.item.stock = parseInt((this.item.stock || 0).toString(), 10);
    this.item.trackImei = !!this.item.trackImei;
    this.item.status = this.item.status || 'Active';

    this.saved.emit(this.item);
  }
}
