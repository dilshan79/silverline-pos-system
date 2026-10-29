import { Component } from '@angular/core';

@Component({
  selector: 'app-roles-permissions',
  templateUrl: './roles-permissions.component.html',
  styleUrls: ['./roles-permissions.component.scss']
})
export class RolesPermissionsComponent {
  roles = [
    { role: 'Owner', posAccess: true, inventoryAccess: true, accountsAccess: true, adminAccess: true },
    { role: 'Manager', posAccess: true, inventoryAccess: true, accountsAccess: true, adminAccess: false },
    { role: 'Cashier', posAccess: true, inventoryAccess: false, accountsAccess: false, adminAccess: false },
    { role: 'Technician', posAccess: false, inventoryAccess: false, accountsAccess: false, adminAccess: false }
  ];
}
