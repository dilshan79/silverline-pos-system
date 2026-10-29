import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CustomerService } from '../services/customer.service';

@Component({
  selector: 'app-customer-list',
  templateUrl: './customer-list.component.html',
  styleUrls: ['./customer-list.component.scss']
})
export class CustomerListComponent implements OnInit {
  @Output() viewCustomer = new EventEmitter<any>();
  customers: any[] = [];

  constructor(private customerService: CustomerService) {}

  ngOnInit(): void {
    this.customerService.getCustomers().subscribe(data => this.customers = data);
  }

  select(c: any): void {
    this.viewCustomer.emit(c);
  }
}
