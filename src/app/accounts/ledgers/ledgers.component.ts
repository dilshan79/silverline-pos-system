import { Component } from '@angular/core';

@Component({
  selector: 'app-ledgers',
  templateUrl: './ledgers.component.html',
  styleUrls: ['./ledgers.component.scss']
})
export class LedgersComponent {
  accounts = [
    { code: '1000', name: 'Cash in Hand', type: 'Asset', balance: 145000 },
    { code: '1010', name: 'Commercial Bank LKR', type: 'Asset', balance: 1850000 },
    { code: '2000', name: 'Accounts Payable', type: 'Liability', balance: 730000 },
    { code: '4000', name: 'Sales Revenue', type: 'Income', balance: 5400000 }
  ];
}
