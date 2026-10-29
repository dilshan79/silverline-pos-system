import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {

  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    const allowedRoles: string[] = route.data['roles'] || [];
    return this.auth.currentUser$.pipe(
      take(1),
      map(user => {
        const activeUser = user || JSON.parse(localStorage.getItem('pos_user') || 'null');
        if (!activeUser) {
          this.router.navigate(['/auth/login']);
          return false;
        }

        if (allowedRoles.length === 0 || allowedRoles.includes(activeUser.role)) {
          return true;
        }

        const fallback = activeUser.role === 'Cashier' ? '/pos' :
                         activeUser.role === 'Technician' ? '/service' :
                         activeUser.role === 'Super Admin' ? '/admin/users' : '/dashboard';
        this.router.navigate([fallback]);
        return false;
      })
    );
  }
}
