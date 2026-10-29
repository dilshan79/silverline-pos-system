import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // Users
  getUsers(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/users`);
  }

  createUser(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/users`, data);
  }

  updateUser(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/users/${id}`, data);
  }

  deleteUser(id: number): Observable<any> {
    return this.http.delete<any>(`${this.API}/users/${id}`);
  }

  // Locations / Branches
  getLocations(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/locations`);
  }

  createLocation(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/locations`, data);
  }

  updateLocation(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/locations/${id}`, data);
  }

  // Roles & Permissions
  getRoles(): Observable<any[]> {
    return this.http.get<any[]>(`${this.API}/roles`);
  }
}
