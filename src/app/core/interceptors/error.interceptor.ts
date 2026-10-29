import { Injectable } from '@angular/core';
import {
  HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {

  constructor(private router: Router) {}

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 401) {
          if (!request.url.includes('action=login') && !request.url.includes('/auth/login')) {
            console.warn('Unauthorized request intercepted:', request.url);
            if (!localStorage.getItem('pos_user')) {
              this.router.navigate(['/auth/login']);
            }
          }
        }
        const message = err.error?.message || err.statusText || 'Unknown error';
        return throwError(() => new Error(message));
      })
    );
  }
}
