import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { LayoutComponent } from './layout/layout.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';

const routes: Routes = [
  // Public: login screen (no guard)
  { path: 'auth', loadChildren: () => import('./auth/auth.module').then(m => m.AuthModule) },

  // Protected: all routes inside layout require login
  {
    path: '',
    component: LayoutComponent,
    canActivate: [AuthGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      // Admin/Owner/Super Admin only
      { path: 'dashboard',
        loadChildren: () => import('./dashboard/dashboard.module').then(m => m.DashboardModule),
        canActivate: [RoleGuard],
        data: { roles: ['Super Admin', 'Admin', 'Owner'] }
      },

      // Cashier, Admin, Owner
      { path: 'pos',
        loadChildren: () => import('./pos/pos.module').then(m => m.PosModule),
        canActivate: [RoleGuard],
        data: { roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] }
      },

      // Admin, Owner
      { path: 'inventory',
        loadChildren: () => import('./inventory/inventory.module').then(m => m.InventoryModule),
        canActivate: [RoleGuard],
        data: { roles: ['Admin', 'Owner', 'Super Admin'] }
      },
      { path: 'purchasing',
        loadChildren: () => import('./purchasing/purchasing.module').then(m => m.PurchasingModule),
        canActivate: [RoleGuard],
        data: { roles: ['Admin', 'Owner', 'Super Admin'] }
      },
      { path: 'accounts',
        loadChildren: () => import('./accounts/accounts.module').then(m => m.AccountsModule),
        canActivate: [RoleGuard],
        data: { roles: ['Admin', 'Owner', 'Super Admin'] }
      },

      // Technician, Admin, Owner
      { path: 'service',
        loadChildren: () => import('./service/service.module').then(m => m.ServiceModule),
        canActivate: [RoleGuard],
        data: { roles: ['Technician', 'Admin', 'Owner', 'Super Admin'] }
      },

      // Cashier, Admin, Owner
      { path: 'customers',
        loadChildren: () => import('./customers/customers.module').then(m => m.CustomersModule),
        canActivate: [RoleGuard],
        data: { roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] }
      },

      // Admin, Owner only
      { path: 'reports',
        loadChildren: () => import('./reports/reports.module').then(m => m.ReportsModule),
        canActivate: [RoleGuard],
        data: { roles: ['Admin', 'Owner', 'Super Admin'] }
      },

      // Super Admin + Owner only
      { path: 'admin',
        loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule),
        canActivate: [RoleGuard],
        data: { roles: ['Super Admin', 'Owner', 'Admin'] }
      },

      // Catch-all
      { path: '**', redirectTo: 'dashboard' }
    ]
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
