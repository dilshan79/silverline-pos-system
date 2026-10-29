import { Component, OnInit } from '@angular/core';
import { LocationService, Location } from '../../../core/services/location.service';

@Component({
  selector: 'app-location-switcher',
  templateUrl: './location-switcher.component.html',
  styleUrls: ['./location-switcher.component.scss']
})
export class LocationSwitcherComponent implements OnInit {
  locations: Location[] = [];
  active: Location | null = null;
  open = false;

  constructor(private locationService: LocationService) {}

  ngOnInit(): void {
    this.locations = this.locationService.getAll();
    this.locationService.active$.subscribe(loc => this.active = loc);
  }

  select(code: string): void {
    this.locationService.setActive(code);
    this.open = false;
  }
}
