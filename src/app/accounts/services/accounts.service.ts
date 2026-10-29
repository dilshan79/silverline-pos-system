import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getLedgers(params?: { type?: string; search?: string }): Observable<any> {
    let p = new HttpParams();
    if (params?.type)   p = p.set('type', params.type);
    if (params?.search) p = p.set('search', params.search);
    return this.http.get<any>(`${this.API}/accounts`, { params: p });
  }

  getLedger(id: number): Observable<any> {
    return this.http.get<any>(`${this.API}/accounts/${id}`);
  }

  createLedger(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/accounts`, data);
  }

  updateLedger(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/accounts/${id}`, data);
  }

  getTransactions(params?: { ledger_id?: number; from?: string; to?: string; page?: number }): Observable<any> {
    let p = new HttpParams();
    if (params?.ledger_id) p = p.set('ledger_id', params.ledger_id.toString());
    if (params?.from)      p = p.set('from', params.from);
    if (params?.to)        p = p.set('to', params.to);
    if (params?.page)      p = p.set('page', params.page.toString());
    return this.http.get<any>(`${this.API}/transactions`, { params: p });
  }

  createTransaction(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/transactions`, data);
  }

  getTrialBalance(): Observable<any> {
    return this.http.get<any>(`${this.API}/accounts/trial-balance`);
  }
}
