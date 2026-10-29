import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

interface NavItem {
  route: string;
  label: string;
  icon: string;
  exact?: boolean;
  roles: string[]; // which roles can see this item
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-layout',
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss']
})
export class LayoutComponent implements OnInit {
  currentUser: any = null;

  // ALL navigation — filtered per role in getVisibleGroups()
  private allGroups: NavGroup[] = [
    {
      title: 'Main',
      items: [
        { route: '/dashboard',   label: 'Dashboard',          icon: '📊', exact: true, roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/pos',         label: 'POS / Billing',      icon: '🧾', exact: true, roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] },
        { route: '/pos/returns', label: 'Returns / Exchange', icon: '↩️', exact: true, roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Inventory',
      items: [
        { route: '/inventory',          label: 'Items',            icon: '📦', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/inventory/stock',    label: 'Stock & IMEI',     icon: '🔢', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/inventory/transfer', label: 'Transfer / Count', icon: '🔄', roles: ['Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Purchasing',
      items: [
        { route: '/purchasing',     label: 'Purchase Order',  icon: '🛒', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/purchasing/grn', label: 'GRN (Goods in)', icon: '📥', roles: ['Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Accounts',
      items: [
        { route: '/accounts',         label: 'Ledgers',          icon: '📒', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/accounts/aging',   label: 'AR / AP Aging',    icon: '📅', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/accounts/voucher', label: 'Voucher / Receipt', icon: '📄', roles: ['Admin', 'Owner', 'Super Admin'] },
        { route: '/accounts/cheques', label: 'Cheques',           icon: '🏦', roles: ['Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Service',
      items: [
        { route: '/service',      label: 'Job Pool',       icon: '🔧', roles: ['Technician', 'Admin', 'Owner', 'Super Admin'] },
        { route: '/service/new',  label: 'New Job',        icon: '➕', roles: ['Technician', 'Admin', 'Owner', 'Super Admin'] },
        { route: '/service/tech', label: 'Technician App', icon: '📱', roles: ['Technician', 'Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Customers',
      items: [
        { route: '/customers',         label: 'Customers',          icon: '👥', roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] },
        { route: '/customers/loyalty', label: 'Loyalty & Vouchers', icon: '⭐', roles: ['Cashier', 'Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Reports',
      items: [
        { route: '/reports', label: 'Reports', icon: '📈', roles: ['Admin', 'Owner', 'Super Admin'] }
      ]
    },
    {
      title: 'Admin',
      items: [
        { route: '/admin/users',    label: 'Users & Roles', icon: '👤', roles: ['Super Admin', 'Admin', 'Owner'] },
        { route: '/admin/settings', label: 'Settings',      icon: '⚙️',  roles: ['Super Admin', 'Admin', 'Owner'] }
      ]
    }
  ];

  visibleGroups: NavGroup[] = [];

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      this.buildNavigation(user?.role ?? '');
    });
  }

  private buildNavigation(role: string): void {
    this.visibleGroups = this.allGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.roles.includes(role))
      }))
      .filter(group => group.items.length > 0);
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/auth/login']);
  }

  get roleBadge(): string {
    const role = this.currentUser?.role ?? '';
    const badges: Record<string, string> = {
      'Super Admin': '👑',
      'Admin':       '🏢',
      'Owner':       '🏢',
      'Cashier':     '🧾',
      'Technician':  '🔧'
    };
    return badges[role] ?? '👤';
  }
}
