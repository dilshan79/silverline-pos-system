import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Location {
  id?: number;
  code: string;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly API = environment.apiUrl;

  // Fallback while API loads
  private locations: Location[] = [];
  private activeSubject = new BehaviorSubject<Location>({ code: '', name: '' });
  active$ = this.activeSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadLocations();
  }

  private loadLocations(): void {
    this.http.get<Location[]>(`${this.API}/locations`).subscribe({
      next: locs => {
        this.locations = locs;
        // Restore previously selected location
        const saved = localStorage.getItem('pos_location');
        const active = locs.find(l => l.code === saved) ?? locs[0];
        if (active) this.activeSubject.next(active);
      },
      error: () => {
        // Fallback to seeded defaults if API not reachable
        this.locations = [
          { code: 'SH', name: 'Fair Road (SH)' },
          { code: 'MW', name: 'Bravo Bus Stand (MW)' },
          { code: 'SS', name: 'Super & Mobile (SS)' }
        ];
        const saved = localStorage.getItem('pos_location');
        const active = this.locations.find(l => l.code === saved) ?? this.locations[0];
        this.activeSubject.next(active);
      }
    });
  }

  getAll(): Location[] {
    return this.locations;
  }

  setActive(code: string): void {
    const loc = this.locations.find(l => l.code === code);
    if (loc) {
      this.activeSubject.next(loc);
      localStorage.setItem('pos_location', code);
    }
  }

  get activeCode(): string {
    return this.activeSubject.value.code;
  }

  get activeId(): number | undefined {
    return this.activeSubject.value.id;
  }
}
