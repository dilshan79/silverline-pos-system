import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): Observable<boolean> {
    return this.auth.currentUser$.pipe(
      take(1),
      map(user => {
        if (user || this.auth.isLoggedIn() || localStorage.getItem('pos_user')) {
          return true;
        }
        this.router.navigate(['/auth/login']);
        return false;
      })
    );
  }
}
