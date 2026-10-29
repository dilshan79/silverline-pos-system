import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { Item, Category, Subcategory } from '../../core/models';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly API = environment.posApiUrl || 'http://localhost/Silver_pos/public/api.php';

  constructor(private http: HttpClient) {}

  // Items
  getItems(params?: { search?: string; category?: string; subcategory?: string }): Observable<Item[]> {
    let p = new HttpParams().set('action', 'get_items');
    if (params?.search)      p = p.set('search', params.search);
    if (params?.category)    p = p.set('category', params.category);
    if (params?.subcategory) p = p.set('subcategory', params.subcategory);

    return this.http.get<any>(this.API, { params: p }).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  saveItem(data: Item): Observable<any> {
    return this.http.post<any>(`${this.API}?action=save_item`, data);
  }

  createItem(data: Item): Observable<any> {
    return this.saveItem(data);
  }

  updateItem(id: number, data: Item): Observable<any> {
    return this.saveItem({ ...data, id });
  }

  deleteItem(codeOrId: string | number): Observable<any> {
    const payload = typeof codeOrId === 'number' ? { id: codeOrId } : { code: codeOrId };
    return this.http.post<any>(`${this.API}?action=delete_item`, payload);
  }

  // Categories
  getCategories(): Observable<Category[]> {
    return this.http.get<any>(`${this.API}?action=get_categories`).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  saveCategory(data: { id?: number; name: string; description?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=save_category`, data);
  }

  deleteCategory(id: number): Observable<any> {
    return this.http.post<any>(`${this.API}?action=delete_category`, { id });
  }

  // Subcategories
  getSubcategories(categoryName?: string): Observable<Subcategory[]> {
    let p = new HttpParams().set('action', 'get_subcategories');
    if (categoryName && categoryName !== 'All') {
      p = p.set('category', categoryName);
    }
    return this.http.get<any>(this.API, { params: p }).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  saveSubcategory(data: { id?: number; category_name: string; name: string; description?: string; category_id?: number }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=save_subcategory`, data);
  }

  deleteSubcategory(id: number): Observable<any> {
    return this.http.post<any>(`${this.API}?action=delete_subcategory`, { id });
  }

  // Stock
  getStock(locationId?: number): Observable<any> {
    return this.http.get<any>(`${this.API}?action=report_inventory`);
  }

  getStockBalance(filters?: { search?: string; category?: string; stock_status?: string }): Observable<any> {
    let p = new HttpParams().set('action', 'get_stock_balance');
    if (filters?.search)       p = p.set('search', filters.search);
    if (filters?.category)     p = p.set('category', filters.category);
    if (filters?.stock_status) p = p.set('stock_status', filters.stock_status);

    return this.http.get<any>(this.API, { params: p });
  }

  adjustStock(data: { code: string; new_stock?: number; qty_delta?: number; reason?: string; user?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=adjust_stock`, data);
  }

  // Locations
  getLocations(): Observable<any[]> {
    return this.http.get<any>(`${this.API}?action=get_locations`).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  // IMEIs
  getImeis(filters?: { search?: string; status?: string; item_code?: string; location?: string }): Observable<any[]> {
    let p = new HttpParams().set('action', 'get_imeis');
    if (filters?.search)    p = p.set('search', filters.search);
    if (filters?.status)    p = p.set('status', filters.status);
    if (filters?.item_code) p = p.set('item_code', filters.item_code);
    if (filters?.location)  p = p.set('location', filters.location);

    return this.http.get<any>(this.API, { params: p }).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  saveImei(data: { id?: number; item_code: string; imei_number: string; location_code?: string; status?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=save_imei`, data);
  }

  // Stock Audit / Count
  saveStockAudit(data: { audits: any[]; location_code?: string; audited_by?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=save_stock_audit`, data);
  }

  getStockAudits(): Observable<any[]> {
    return this.http.get<any>(`${this.API}?action=get_stock_audits`).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  // Transfer of Goods (TOG)
  getStockTransfers(): Observable<any[]> {
    return this.http.get<any>(`${this.API}?action=get_stock_transfers`).pipe(
      map(res => (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [])
    );
  }

  createStockTransfer(data: { from_location: string; to_location: string; items: any[]; notes?: string; created_by?: string }): Observable<any> {
    return this.http.post<any>(`${this.API}?action=create_stock_transfer`, data);
  }
}
