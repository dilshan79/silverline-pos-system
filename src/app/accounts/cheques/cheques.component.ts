import { Component } from '@angular/core';

@Component({
  selector: 'app-cheques',
  templateUrl: './cheques.component.html',
  styleUrls: ['./cheques.component.scss']
})
export class ChequesComponent {
  cheques = [
    { chequeNo: 'CHQ-882101', bank: 'Commercial Bank', amount: 85000, dueDate: '2026-10-15', status: 'Pending' }
  ];
}
