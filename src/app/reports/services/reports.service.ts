import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly POS_API = environment.posApiUrl || 'http://localhost/Silver_pos/public/api.php';

  constructor(private http: HttpClient) {}

  getSalesSummary(from: string, to: string, locationId?: number): Observable<any> {
    let p = new HttpParams().set('action', 'report_sales').set('from', from).set('to', to);
    if (locationId) p = p.set('location_id', locationId.toString());
    return this.http.get<any>(this.POS_API, { params: p });
  }

  getTopItems(from: string, to: string, limit = 10): Observable<any> {
    const p = new HttpParams().set('action', 'report_top_items').set('from', from).set('to', to).set('limit', limit.toString());
    return this.http.get<any>(this.POS_API, { params: p });
  }

  getProfitLoss(from: string, to: string): Observable<any> {
    const p = new HttpParams().set('action', 'report_profit_loss').set('from', from).set('to', to);
    return this.http.get<any>(this.POS_API, { params: p });
  }

  getStockReport(locationId?: number): Observable<any> {
    let p = new HttpParams().set('action', 'report_inventory');
    if (locationId) p = p.set('location_id', locationId.toString());
    return this.http.get<any>(this.POS_API, { params: p });
  }

  getTaxReport(from: string, to: string): Observable<any> {
    const p = new HttpParams().set('action', 'report_tax').set('from', from).set('to', to);
    return this.http.get<any>(this.POS_API, { params: p });
  }

  getAuditLog(params?: { user_id?: number; action?: string; from?: string; to?: string; page?: number }): Observable<any> {
    let p = new HttpParams().set('action', 'report_sales');
    if (params?.from) p = p.set('from', params.from);
    if (params?.to)   p = p.set('to', params.to);
    return this.http.get<any>(this.POS_API, { params: p });
  }
}
