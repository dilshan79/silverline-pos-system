import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getSummary(): Observable<any> {
    return this.http.get<any>(`${this.API}/dashboard/summary`);
  }

  getRecentSales(limit = 5): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/dashboard/recent-sales?limit=${limit}`);
  }

  getLowStock(threshold = 5): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/dashboard/low-stock?threshold=${threshold}`);
  }
}
