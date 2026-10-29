export interface Item {
  id?: number;
  code: string;
  name: string;
  categoryName: string;
  brandName?: string;
  cost?: number;
  price: number;
  stock: number;
  trackImei: boolean;
  warrantyMonths?: number;
  status?: string;
}
