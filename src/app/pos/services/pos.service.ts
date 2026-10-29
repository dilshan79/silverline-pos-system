import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { InvoiceItem } from '../../core/models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly API = environment.apiUrl;

  private cartSubject = new BehaviorSubject<InvoiceItem[]>([]);
  cart$ = this.cartSubject.asObservable();

  constructor(private http: HttpClient) {}

  // Search items for POS grid
  searchItems(query: string = '', locationId?: number): Observable<any> {
    let p = new HttpParams().set('search', query).set('active', '1');
    if (locationId) p = p.set('location_id', locationId.toString());
    return this.http.get<any>(`${this.API}/items`, { params: p });
  }

  // Cart operations
  addToCart(item: any): void {
    const cart = this.cartSubject.value;
    const existing = cart.find(c => c.code === item.code);
    if (existing) {
      existing.qty++;
      existing.total = existing.qty * existing.price;
    } else {
      cart.push({ code: item.code, name: item.name, qty: 1, price: item.price, total: item.price });
    }
    this.cartSubject.next([...cart]);
  }

  updateQty(code: string, qty: number): void {
    const cart = this.cartSubject.value.map(c =>
      c.code === code ? { ...c, qty, total: qty * c.price } : c
    );
    this.cartSubject.next(cart);
  }

  removeFromCart(code: string): void {
    this.cartSubject.next(this.cartSubject.value.filter(c => c.code !== code));
  }

  clearCart(): void {
    this.cartSubject.next([]);
  }

  getTotal(): number {
    return this.cartSubject.value.reduce((s, c) => s + c.total, 0);
  }

  // Save invoice to real database
  saveInvoice(invoice: any): Observable<any> {
    return this.http.post<any>(`${this.API}/invoices`, invoice);
  }

  // Get invoices history
  getInvoices(params?: { page?: number; customer?: string }): Observable<any> {
    let p = new HttpParams();
    if (params?.page)     p = p.set('page', params.page.toString());
    if (params?.customer) p = p.set('customer', params.customer);
    return this.http.get<any>(`${this.API}/invoices`, { params: p });
  }
}
