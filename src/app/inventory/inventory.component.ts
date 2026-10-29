import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent implements OnInit {
  activeTab = 'items';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path ?? '';
    if (path === 'stock') {
      this.activeTab = 'stock-balance';
    } else if (path === 'transfer') {
      this.activeTab = 'transfer';
    } else if (path === 'categories') {
      this.activeTab = 'categories';
    } else if (path === 'subcategories') {
      this.activeTab = 'subcategories';
    }
  }
}

