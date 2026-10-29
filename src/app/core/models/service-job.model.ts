export interface ServiceJob {
  id?: number;
  jobNo: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  status: 'Pool' | 'Assigned' | 'In Progress' | 'Completed';
  technicianAssigned?: string;
  notes?: string;
  createdAt?: string;
}
