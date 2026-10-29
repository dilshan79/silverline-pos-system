import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, tap, timeout, catchError, of } from 'rxjs';
import { User } from '../models';
import { environment } from '../../../environments/environment';

const AUTH_TIMEOUT_MS = 10000;

// Shape of a user as api.php returns it
interface ApiUser {
  id: number;
  username: string;
  full_name: string;
  role: User['role'];
  location_code: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly API = environment.posApiUrl || 'http://localhost/Silver_pos/public/api.php';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem('pos_user');
    if (saved) {
      try {
        this.currentUserSubject.next(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('pos_user');
      }
    }
  }

  login(username: string, password: string): Observable<{ token: string; user: User }> {
    return this.http.post<any>(`${this.API}?action=login`, { username, password }).pipe(
      timeout(AUTH_TIMEOUT_MS),
      map(res => {
        if (res?.status !== 'success' || !res.token) {
          throw { error: { message: res?.message ?? 'Invalid username or password.' } };
        }
        return { token: res.token as string, user: this.toUser(res.user, res.token) };
      }),
      tap(({ user }) => this.setUser(user))
    );
  }

  /**
   * Reload the logged in user from the server so names and roles are current.
   * Logs out when the session is no longer valid. Keeps the cached user if the server is unreachable.
   */
  refreshCurrentUser(): Observable<User | null> {
    const token = this.currentUser?.token || localStorage.getItem('pos_token') || '';
    if (!token) return of(this.currentUser);
    return this.http.get<any>(this.API, { params: { action: 'me', token } }).pipe(
      timeout(AUTH_TIMEOUT_MS),
      map(res => {
        if (res?.user) {
          const user = this.toUser(res.user, token);
          this.setUser(user);
          return user;
        }
        return this.currentUser;
      }),
      catchError(err => {
        console.warn('Could not refresh user from server, using cached session details', err);
        return of(this.currentUser);
      })
    );
  }

  logout(): void {
    if (this.currentUser?.token) {
      this.http.post(`${this.API}?action=logout`, {}).pipe(timeout(AUTH_TIMEOUT_MS)).subscribe({ error: () => {} });
    }
    this.clearUser();
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  private toUser(u: ApiUser, token: string): User {
    return {
      id: u.id,
      username: u.username,
      fullName: u.full_name,
      role: u.role,
      locationCode: u.location_code,
      token
    };
  }

  private setUser(user: User): void {
    localStorage.setItem('pos_user', JSON.stringify(user));
    localStorage.setItem('pos_token', user.token ?? '');
    this.currentUserSubject.next(user);
  }

  private clearUser(): void {
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_token');
    this.currentUserSubject.next(null);
  }
}
