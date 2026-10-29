import { Component, OnInit } from '@angular/core';
import { AdminService } from '../services/admin.service';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  showForm = false;
  errorMsg = '';
  newUser = { username: '', password: '', fullName: '', role: 'Cashier', locationCode: 'MW' };

  constructor(private adminService: AdminService) {}

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.adminService.getUsers().subscribe((res: any) => {
      this.users = res?.data ?? res ?? [];
    });
  }

  createUser(): void {
    this.errorMsg = '';
    if (!this.newUser.username || !this.newUser.password) {
      this.errorMsg = 'Username and password are required.';
      return;
    }
    this.adminService.createUser(this.newUser).subscribe({
      next: () => {
        this.showForm = false;
        this.newUser = { username: '', password: '', fullName: '', role: 'Cashier', locationCode: 'MW' };
        this.loadUsers();
      },
      error: (err: any) => {
        this.errorMsg = err?.error?.message ?? 'Failed to create user.';
      }
    });
  }

  toggleStatus(user: any): void {
    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    this.adminService.updateUser(user.id, { status: newStatus }).subscribe(() => {
      user.status = newStatus;
    });
  }
}
