import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PurchasingService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getOrders(params?: { status?: string; page?: number }): Observable<any> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    if (params?.page)   p = p.set('page', params.page.toString());
    return this.http.get<any>(`${this.API}/purchase-orders`, { params: p });
  }

  getOrder(id: number): Observable<any> {
    return this.http.get<any>(`${this.API}/purchase-orders/${id}`);
  }

  createOrder(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/purchase-orders`, data);
  }

  receiveOrder(id: number, data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/purchase-orders/${id}/receive`, data);
  }

  getSuppliers(search?: string): Observable<any[]> {
    let p = new HttpParams();
    if (search) p = p.set('search', search);
    return this.http.get<any[]>(`${this.API}/suppliers`, { params: p });
  }

  createSupplier(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/suppliers`, data);
  }
}
