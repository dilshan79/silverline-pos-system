import { Component } from '@angular/core';

@Component({
  selector: 'app-service-types',
  templateUrl: './service-types.component.html',
  styleUrls: ['./service-types.component.scss']
})
export class ServiceTypesComponent {
  serviceTypes = [
    { name: 'Display Replacement', basePrice: 15000, estimatedHours: 2 },
    { name: 'Battery Replacement', basePrice: 8500, estimatedHours: 1 },
    { name: 'CCTV Setup & Wiring', basePrice: 25000, estimatedHours: 6 }
  ];
}
