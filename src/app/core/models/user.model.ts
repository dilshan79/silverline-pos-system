export interface User {
  id?: number;
  username: string;
  fullName: string;
  role: 'Owner' | 'Cashier' | 'Technician' | 'Manager';
  locationCode: string;
  token?: string;
}
