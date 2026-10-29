import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-customer-360',
  templateUrl: './customer-360.component.html',
  styleUrls: ['./customer-360.component.scss']
})
export class Customer360Component {
  @Input() customer: any = {
    name: 'Kasun Perera',
    phone: '0771234567',
    email: 'kasun@gmail.com',
    loyaltyPoints: 450,
    creditLimit: 50000,
    outstanding: 12000
  };
}
