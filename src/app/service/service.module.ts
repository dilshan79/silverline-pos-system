import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { ServiceRoutingModule } from './service-routing.module';
import { ServiceComponent } from './service.component';
import { JobPoolComponent } from './job-pool/job-pool.component';
import { NewJobComponent } from './new-job/new-job.component';
import { JobDetailComponent } from './job-detail/job-detail.component';
import { RepairsComponent } from './repairs/repairs.component';
import { TechnicianAppComponent } from './technician-app/technician-app.component';

@NgModule({
  declarations: [
    ServiceComponent,
    JobPoolComponent,
    NewJobComponent,
    JobDetailComponent,
    RepairsComponent,
    TechnicianAppComponent
  ],
  imports: [
    SharedModule,
    ServiceRoutingModule
  ]
})
export class ServiceModule { }
