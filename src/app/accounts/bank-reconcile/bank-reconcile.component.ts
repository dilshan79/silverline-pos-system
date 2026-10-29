import { Component } from '@angular/core';

@Component({
  selector: 'app-bank-reconcile',
  templateUrl: './bank-reconcile.component.html',
  styleUrls: ['./bank-reconcile.component.scss']
})
export class BankReconcileComponent {
  bankBalance = 1850000;
  bookBalance = 1850000;
  reconciled = true;
}
