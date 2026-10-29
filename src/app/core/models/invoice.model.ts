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
