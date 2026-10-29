export interface User {
  id?: number;
  username: string;
  fullName: string;
  role: 'Super Admin' | 'Admin' | 'Owner' | 'Cashier' | 'Technician' | 'Manager';
  locationCode?: string;
  token?: string;
}

export interface Item {
  id?: number;
  code: string;
  name: string;
  categoryName?: string;
  category?: string;
  subcategory?: string;
  brandName?: string;
  cost?: number;
  price: number;
  stock: number;
  trackImei?: boolean;
  track_imei?: number | boolean;
  warrantyMonths?: number;
  status?: string;
}

export interface Category {
  id?: number;
  name: string;
  description?: string;
  item_count?: number;
  subcategory_count?: number;
}

export interface Subcategory {
  id?: number;
  category_id?: number;
  category_name: string;
  name: string;
  description?: string;
  item_count?: number;
}

export interface InvoiceItem {
  code: string;
  name: string;
  qty: number;
  price: number;
  total: number;
}

export interface Invoice {
  id?: number;
  invoiceNo: string;
  customerPhone?: string;
  subtotal: number;
  discount: number;
  total: number;
  tendered: number;
  paymentMethod: string;
  items: InvoiceItem[];
}

export interface ServiceJob {
  id?: number;
  jobNo: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  status: 'Pool' | 'Assigned' | 'In Progress' | 'Completed';
  technicianAssigned?: string;
}
