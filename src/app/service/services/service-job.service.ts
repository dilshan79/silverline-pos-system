import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ServiceJobService {
  private readonly API = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getJobs(params?: { status?: string; search?: string; page?: number }): Observable<any> {
    let p = new HttpParams();
    if (params?.status) p = p.set('status', params.status);
    if (params?.search) p = p.set('search', params.search);
    if (params?.page)   p = p.set('page', params.page.toString());
    return this.http.get<any>(`${this.API}/service-jobs`, { params: p });
  }

  getJob(id: number): Observable<any> {
    return this.http.get<any>(`${this.API}/service-jobs/${id}`);
  }

  createJob(data: any): Observable<any> {
    return this.http.post<any>(`${this.API}/service-jobs`, data);
  }

  updateJob(id: number, data: any): Observable<any> {
    return this.http.put<any>(`${this.API}/service-jobs/${id}`, data);
  }

  updateStatus(id: number, status: string, notes?: string): Observable<any> {
    return this.http.patch<any>(`${this.API}/service-jobs/${id}/status`, { status, notes });
  }
}
