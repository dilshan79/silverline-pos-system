import { Injectable } from '@angular/core';
import {
  HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private router: Router) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    let token = localStorage.getItem('pos_token');
    if (!token) {
      try {
        const user = JSON.parse(localStorage.getItem('pos_user') || 'null');
        token = user?.token;
      } catch (e) {
        token = null;
      }
    }

    let cloned = request;
    if (token) {
      cloned = request.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
          'X-Auth-Token': token
        }
      });
    }

    return next.handle(cloned).pipe(
      catchError((error: HttpErrorResponse) => {
        // Redirect to login if 401 Unauthorized occurs on an authenticated route
        if (error.status === 401 && !request.url.includes('action=login')) {
          localStorage.removeItem('pos_user');
          localStorage.removeItem('pos_token');
          this.router.navigate(['/auth/login']);
        }
        return throwError(() => error);
      })
    );
  }
}
