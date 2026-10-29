import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getCustomers(params?: { search?: string; page?: number }): Observable<any> {
    let p = new HttpParams();
    if (params?.search) p = p.set('search', params.search);
    if (params?.page)   p = p.set('page', params.page.toString());
    return this.http.get<any>(`${this.API}/customers`, { params: p });
  }

  getCustomer(id: number): Observable<any> {
    return this.http.get<any>(`${this.API}/customers/${id}`);
  }

  createCustomer(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/customers`, data);
  }

  updateCustomer(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/customers/${id}`, data);
  }

  deleteCustomer(id: number): Observable<any> {
    return this.http.delete<any>(`${this.API}/customers/${id}`);
  }

  getCustomerInvoices(id: number): Observable<any> {
    return this.http.get<any>(`${this.API}/customers/${id}/invoices`);
  }
}
