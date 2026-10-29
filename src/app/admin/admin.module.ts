import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { AdminRoutingModule } from './admin-routing.module';
import { AdminComponent } from './admin.component';
import { UsersComponent } from './users/users.component';
import { RolesPermissionsComponent } from './roles-permissions/roles-permissions.component';
import { SettingsComponent } from './settings/settings.component';
import { AuditLogComponent } from './audit-log/audit-log.component';
import { ServiceTypesComponent } from './service-types/service-types.component';

@NgModule({
  declarations: [
    AdminComponent,
    UsersComponent,
    RolesPermissionsComponent,
    SettingsComponent,
    AuditLogComponent,
    ServiceTypesComponent
  ],
  imports: [
    SharedModule,
    AdminRoutingModule
  ]
})
export class AdminModule { }
