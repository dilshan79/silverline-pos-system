import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  username = '';
  password = '';
  location = 'MW';
  errorMsg = '';
  loading = false;

  locations = [
    { code: 'SH', name: 'Fair Road (SH)' },
    { code: 'MW', name: 'Bravo Bus Stand (MW)' },
    { code: 'SS', name: 'Super & Mobile (SS)' }
  ];

  constructor(private router: Router, private authService: AuthService) {}

  login(): void {
    this.errorMsg = '';
    if (!this.username.trim() || !this.password.trim()) {
      this.errorMsg = 'Username and password are required.';
      return;
    }
    this.loading = true;
    this.authService.login(this.username, this.password).subscribe({
      next: (res: any) => {
        this.loading = false;
        const role = res?.user?.role ?? '';
        // Redirect based on role
        switch (role) {
          case 'Super Admin':
            this.router.navigate(['/admin/users']);
            break;
          case 'Admin':
          case 'Owner':
            this.router.navigate(['/dashboard']);
            break;
          case 'Cashier':
            this.router.navigate(['/pos']);
            break;
          case 'Technician':
            this.router.navigate(['/service']);
            break;
          default:
            this.router.navigate(['/dashboard']);
        }
      },
      error: (err: any) => {
        this.loading = false;
        this.errorMsg = err?.error?.message ?? 'Invalid username or password.';
      }
    });
  }

  fillDemo(username: string, pass: string, loc = 'MW'): void {
    this.username = username;
    this.password = pass;
    this.location = loc;
    this.errorMsg = '';
  }

  onEnter(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.login();
  }
}
