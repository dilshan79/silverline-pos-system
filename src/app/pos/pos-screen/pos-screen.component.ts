import { Component, OnInit, HostListener, AfterViewInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { retry, timeout } from 'rxjs/operators';
import { Item } from '../../core/models';
import { AuthService } from '../../core/services/auth.service';
import { code128Svg } from '../../shared/utils/code128';
import { environment } from '../../../environments/environment';

type DiscountType = 'pct' | 'amt';
// pct: percent off. amt: rupees off the whole line (not per unit) or the whole sub total.
interface Discount { type: DiscountType; value: number; }

interface SuspendedLine {
  code: string;
  name: string;
  qty: number;
  price: number;
  discount?: Discount | null;
  price_override?: boolean;  // price was set with New Price, keep it on recall
}

// A completed bill as returned by get_sale, used for reprints
interface SaleLine { code: string; name: string; qty: number; price: number; discount: number; discount_label: string | null; total: number; }
interface SaleRecord {
  invoice_no: string;
  created_at: string;
  cashier: string;
  salesman?: string;
  location?: string;
  payment_method: string;
  terminal?: string;
  subtotal: number;
  discount: number;
  discount_label: string | null;
  total: number;
  tendered: number;
  items: SaleLine[];
  local?: boolean;
}

const LOCAL_SALES_KEY = 'pos_local_sales';

// Till shift: opening float plus cash sales since then
interface CashSummary {
  session_id?: number;
  terminal: string;
  cashier: string;
  opened_at: string;
  opening_float: number;
  cash_sales_count: number;
  cash_sales_total: number;
  card_sales_count?: number;
  card_sales_total?: number;
  paid_in_total?: number;
  paid_out_total?: number;
  expected_cash: number;
  counted_cash?: number;
  difference?: number;
  closed_at?: string;
  status?: 'Open' | 'Closed' | string;
  z_reading_no?: number;
  last_invoice_no?: string;
  next_invoice_no?: string;
}

export interface DenominationItem {
  value: number;
  label: string;
  count: number | null;
}
interface SuspendedBill {
  suspend_no: string;
  items: SuspendedLine[];
  bill_discount?: Discount | null;
  total: number;
  cashier: string;
  terminal: string;
  created_at: string;
  local?: boolean;
}

const API_TIMEOUT_MS = 8000;
const LOCAL_SUSPEND_KEY = 'pos_suspended_bills';

@Component({
  selector: 'app-pos-screen',
  templateUrl: './pos-screen.component.html',
  styleUrls: ['./pos-screen.component.scss']
})
export class PosScreenComponent implements OnInit, AfterViewInit {
  items: Item[] = [
    { code: '101005', name: 'Samsung A03s 64GB', categoryName: 'Phones', price: 72900, stock: 6, trackImei: true },
    { code: '101003', name: 'Samsung M02 32GB', categoryName: 'Phones', price: 31900, stock: 0, trackImei: true },
    { code: '101004', name: 'Redmi 12 128GB', categoryName: 'Phones', price: 58500, stock: 2, trackImei: true },
    { code: '101002', name: '7W LED Bulb', categoryName: 'Accessories', price: 250, stock: 40, trackImei: false },
    { code: '101006', name: 'Fast Charger', categoryName: 'Accessories', price: 1800, stock: 12, trackImei: false },
    { code: '101007', name: 'Back Cover', categoryName: 'Accessories', price: 600, stock: 30, trackImei: false }
  ];

  cart: { [key: number]: number } = {};
  tenderedAmount: number = 0;
  selectedCartIndex: number | null = null;
  activeCategory: string = 'Phones';
  posCategories: string[] = ['All', 'Phones', 'Accessories', 'Bill Payments', 'Dialog TV Services', 'Reload / Cards', 'Repairs'];

  showKeypad: boolean = false;
  keypadInputStr: string = '';

  selectedPaymentMethod: string = 'Cash';
  selectedCustomer: string = 'Cash Customer';
  customerList: string[] = ['Cash Customer', '0703885240 - Mr Gamage (Credit)', '0702256233 - Mr Acman (Retail)', '0771234567 - Walk-in Customer'];

  paymentDetails: any = {};
  showPaymentDetailModal: boolean = false;
  paymentModalType: 'card' | 'cheque' | 'credit' | 'split' | 'voucher' | 'loyalty' | 'credit_note' = 'card';

  cardForm = {
    cardType: 'Visa',
    authCode: '',
    last4: '',
    bank: 'Commercial Bank'
  };

  chequeForm = {
    chequeNo: '',
    bankName: 'Commercial Bank',
    branch: 'Mawathagama',
    chequeDate: new Date().toISOString().slice(0, 10)
  };

  creditForm = {
    customerPhone: '0703885240',
    customerName: 'Mr Gamage',
    creditLimit: 50000,
    currentBalance: 12500,
    dueDate: '30 Days'
  };

  splitForm = {
    cashAmount: 0,
    secondaryAmount: 0,
    secondaryMethod: 'Visa',
    reference: ''
  };

  voucherForm = {
    voucherNo: '',
    voucherAmount: 0
  };

  loyaltyForm = {
    phone: '',
    availablePoints: 850,
    pointsToRedeem: 0
  };

  creditNoteForm = {
    creditNoteNo: '',
    originalInvoice: '',
    amount: 0
  };

  private readonly API = environment.posApiUrl || 'http://localhost/Silver_pos/public/api.php';

  cashSession: CashSummary | null = null;
  showFloat: boolean = false;
  floatInput: string = '';
  floatActionType: 'open' | 'add' = 'open';
  floatReason: string = '';
  showClose: boolean = false;
  countedInput: string = '';
  cashError: string = '';
  cashBusy: boolean = false;
  lastClosedSession: CashSummary | null = null;
  zReadingRequestedMode: 'view' | 'print' | null = null;
  tempAuditCountedCash: number | null = null;
  drawerCountReportMode: 'z_reading' | 'cashier_reading' | 'close_cash' | null = null;
  drawerCountAction: 'view' | 'print' = 'print';

  showPaidModal: boolean = false;
  paidMode: 'paid_in' | 'paid_out' = 'paid_in';
  paidAmountInput: string = '';
  paidReasonInput: string = '';
  paidError: string = '';
  paidBusy: boolean = false;

  showCashierReports: boolean = false;
  selectedReportIndex: number = 0;
  cashierReportsData: any = null;
  showReportDetailModal: boolean = false;
  activeReportDetail: { title: string; subtitle?: string; contentHtml: string; rawBody?: string } | null = null;

  cashierReportsList: Array<{ id: string; title: string; description: string }> = [
    { id: 'x_reading', title: 'X Reading (Current Sale Report)', description: 'Mid-shift sales summary and cash drawer status' },
    { id: 'z_reading', title: 'Z Reading (Day End Report)', description: 'Full day-end sales, tax and drawer reconciliation report' },
    { id: 'cashier_reading', title: 'Cashier Reading', description: 'Sales and till summary for current active cashier' },
    { id: 'discount_report', title: 'Discount Report', description: 'Summary of line and bill discounts applied today' },
    { id: 'suspend_report', title: 'Suspend Report', description: 'List of all suspended bills' },
    { id: 'pending_suspend_report', title: 'Pending Suspend Report', description: 'List of currently open pending suspended bills' },
    { id: 'paid_out_report', title: 'Paid Out Report', description: 'Cash paid out / petty cash disbursements log' },
    { id: 'paid_in_report', title: 'Paid In Report', description: 'Cash paid into till register log' },
    { id: 'bill_cancel_report', title: 'Bill Cancel Report', description: 'Log of voided items and cancelled bills' },
    { id: 'item_wise_report', title: 'Item Wise Sale Report', description: 'Sales breakdown by item code and category' },
    { id: 'card_usage_report', title: 'Credit Card Usage Report', description: 'Credit/Debit card transaction log and totals' },
    { id: 'salesman_wise_report', title: 'Salesman Wise Sales Report', description: 'Sales performance grouped by salesman' },
    { id: 'credit_note_report', title: 'Credit Note Report', description: 'Credit notes issued and redeemed summary' },
    { id: 'currency_details_report', title: 'Currency Details Report', description: 'Cash drawer float and note/coin denomination breakdown' },
    { id: 'exit_system', title: 'Exit From System', description: 'Logout or exit system session' },
    { id: 'shutdown_terminal', title: 'Shut Down Terminal', description: 'Close cash shift and shut down terminal' },
    { id: 'exit_menu', title: 'Exit Menu', description: 'Close cashier reports menu' }
  ];

  denominations: DenominationItem[] = [
    { value: 5000, label: '5,000', count: null },
    { value: 2000, label: '2,000', count: null },
    { value: 1000, label: '1,000', count: null },
    { value: 500,  label: '500',   count: null },
    { value: 100,  label: '100',   count: null },
    { value: 50,   label: '50',    count: null },
    { value: 20,   label: '20',    count: null },
    { value: 10,   label: '10',    count: null },
    { value: 5,    label: '5',     count: null },
    { value: 2,    label: '2',     count: null },
    { value: 1,    label: '1',     count: null },
    { value: 0.5,  label: '0.50',  count: null }
  ];

  // New Price: typed into the scan field, used for the next item added only
  pendingPrice: number | null = null;
  linePrices: { [key: number]: number } = {};
  lineImeis: { [key: number]: string } = {};

  lineDiscounts: { [key: number]: Discount } = {};
  billDiscount: Discount | null = null;
  discountType: DiscountType = 'pct';
  showDiscount: boolean = false;
  discountTarget: 'line' | 'bill' = 'bill';
  discountInput: string = '';
  discountError: string = '';

  searchText: string = '';
  showRecall: boolean = false;
  recallInput: string = '';
  suspendedBills: SuspendedBill[] = [];
  // Filled from the logged in user, see loadCurrentUser()
  cashier: string = '';
  userRole: string = '';
  username: string = '';
  terminal: string = '#1';
  location: string = 'Bravo Bus Stand (MW)';
  selectedSalesman: string = 'N/D';
  salesmenList: string[] = ['N/D', 'Kasun', 'Rashmika', 'Dilshan', 'Saman'];
  currentInvoiceNo: string = 'INMW10000001';

  currentDateTime: Date = new Date();
  private timer: any;

  constructor(private http: HttpClient, private authService: AuthService) {}

  get canViewCashInHand(): boolean {
    const role = (this.userRole || '').trim().toLowerCase();
    return role === 'admin' || role === 'super admin' || role === 'owner';
  }

  ngOnInit(): void {
    this.loadCurrentUser();
    this.loadPosMeta();
    this.timer = setInterval(() => {
      this.currentDateTime = new Date();
    }, 1000);
    this.http.get<any>(`${this.API}?action=get_categories`).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data && res.data.length > 0) {
          const names = res.data.map((c: any) => c.name);
          this.posCategories = ['All', ...names];
        }
      }
    });
    this.http.get<any>(`${this.API}?action=get_items`).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data && res.data.length > 0) {
          this.items = res.data.map((i: any) => ({
            code: i.code,
            name: i.name,
            categoryName: i.category || i.categoryName,
            category: i.category || i.categoryName,
            subcategory: i.subcategory || '',
            price: parseFloat(i.price),
            cost: parseFloat(i.cost || 0),
            stock: parseInt(i.stock),
            trackImei: i.track_imei == 1
          }));
        }
      }
    });
    this.loadCashStatus();
  }

  loadCurrentUser(): void {
    // 1. Subscribe to currentUser$ stream from AuthService
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.applyUserData(user);
      }
    });

    // 2. Initial state from cached user or localStorage
    const cached = this.authService.currentUser;
    if (cached) {
      this.applyUserData(cached);
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('pos_user') || 'null');
        if (stored) {
          this.applyUserData(stored);
        }
      } catch (e) {}
    }

    // 3. Keep refreshed from server
    this.authService.refreshCurrentUser().subscribe(user => {
      if (user) {
        this.applyUserData(user);
      }
    });
  }

  private applyUserData(user: any): void {
    if (!user) return;
    this.username = user.username || '';
    this.cashier = user.fullName || user.full_name || user.username || 'User';
    this.userRole = user.role || 'Cashier';
    if (!this.selectedSalesman || this.selectedSalesman === 'N/D') {
      this.selectedSalesman = user.fullName || user.full_name || user.username || 'N/D';
    }
    this.resolveLocation(user.locationCode || user.location_code);
  }

  private resolveLocation(code?: string): void {
    const locCode = (code || 'MW').toUpperCase().trim();
    const fallbackLocations: Record<string, string> = {
      'MW': 'Bravo Bus Stand (MW)',
      'SH': 'Fair Road (SH)',
      'SS': 'Super & Mobile (SS)'
    };

    this.location = fallbackLocations[locCode] || `Branch (${locCode})`;

    this.http.get<any>(`${environment.apiUrl}/locations`).subscribe({
      next: (res) => {
        const list = res?.data || res || [];
        if (Array.isArray(list)) {
          const match = list.find((l: any) => (l.code || '').toUpperCase() === locCode);
          if (match && match.name) {
            this.location = match.name.includes(match.code) ? match.name : `${match.name} (${match.code})`;
          }
        }
      },
      error: () => {}
    });
  }

  getTerminalDigit(): string {
    return (this.terminal.replace(/\D/g, '') || '1');
  }

  onTerminalChange(): void {
    this.loadCashStatus();
    this.loadPosMeta();
  }

  loadPosMeta(): void {
    this.apiGet<any>('get_pos_meta', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          if (res.location && !res.location.includes('Mawathagama')) this.location = res.location;
          if (res.salesmen && res.salesmen.length > 0) this.salesmenList = res.salesmen;
          if (res.next_invoice_no) this.currentInvoiceNo = res.next_invoice_no;
          if (res.user) this.applyUserData(res.user);
        }
      },
      error: (err) => console.warn('Could not load pos meta', err)
    });
  }

  ngAfterViewInit(): void {
    this.refocusScanInput();
  }

  matchesFilter(item: Item): boolean {
    const catMatch = this.activeCategory === 'All' || item.categoryName === this.activeCategory || item.category === this.activeCategory;
    if (!catMatch) return false;
    if (!this.searchText || !this.searchText.trim()) return true;
    const q = this.searchText.trim().toLowerCase();
    return Boolean(
      (item.name && item.name.toLowerCase().includes(q)) ||
      (item.code && item.code.toLowerCase().includes(q)) ||
      (item.subcategory && item.subcategory.toLowerCase().includes(q))
    );
  }

  onSearchEnter(): void {
    const raw = (this.searchText || '').trim();
    if (!raw) return;

    if (raw.toUpperCase().startsWith('SUS')) {
      this.searchText = '';
      this.recallBill(raw.toUpperCase());
      return;
    }

    // 1. Direct match by exact item code / PLU / barcode in loaded items
    let foundIdx = this.items.findIndex(
      it => (it.code || '').trim().toLowerCase() === raw.toLowerCase()
    );

    // 2. Direct match by exact item name in loaded items
    if (foundIdx === -1) {
      foundIdx = this.items.findIndex(
        it => (it.name || '').trim().toLowerCase() === raw.toLowerCase()
      );
    }

    if (foundIdx !== -1) {
      this.addToCart(foundIdx);
      this.searchText = '';
      this.refocusScanInput();
      return;
    }

    // 3. Search via backend API: matches exact code, barcode, or IMEI in database
    this.http.get<any>(`${this.API}?action=lookup_barcode_or_imei&query=${encodeURIComponent(raw)}`).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data && res.data.item) {
          const itemData = res.data.item;
          const imeiNum = res.data.imei;

          let idx = this.items.findIndex(
            it => (it.code || '').trim().toLowerCase() === (itemData.code || '').trim().toLowerCase()
          );

          if (idx === -1) {
            const newItem: Item = {
              code: itemData.code,
              name: itemData.name,
              categoryName: itemData.category || itemData.categoryName || 'General',
              category: itemData.category || itemData.categoryName || 'General',
              subcategory: itemData.subcategory || '',
              price: parseFloat(itemData.price || 0),
              cost: parseFloat(itemData.cost || 0),
              stock: parseInt(itemData.stock || 0),
              trackImei: itemData.track_imei == 1 || itemData.trackImei === true
            };
            this.items.push(newItem);
            idx = this.items.length - 1;
          }

          this.addToCart(idx);
          if (imeiNum) {
            this.lineImeis[idx] = imeiNum;
          }
          this.searchText = '';
          this.refocusScanInput();
          return;
        }

        // 4. Fallback to in-memory substring match
        this.performFallbackSearch(raw);
      },
      error: () => {
        this.performFallbackSearch(raw);
      }
    });
  }

  private performFallbackSearch(query: string): void {
    const q = query.toLowerCase();
    const matchIdx = this.items.findIndex(
      it => (it.code || '').toLowerCase().includes(q) ||
            (it.name || '').toLowerCase().includes(q)
    );
    if (matchIdx !== -1) {
      this.addToCart(matchIdx);
      this.searchText = '';
      this.refocusScanInput();
    } else {
      alert(`No product found for Barcode / PLU / IMEI: "${query}"`);
      this.refocusScanInput();
    }
  }

  refocusScanInput(): void {
    setTimeout(() => {
      const el = document.getElementById('pos-search-input') as HTMLInputElement;
      if (el) {
        el.focus();
        el.select();
      }
    }, 100);
  }

addToCart(index: number): void {
    this.cart[index] = (this.cart[index] || 0) + 1;
    this.selectedCartIndex = index;
    if (this.pendingPrice !== null) {
      // New Price applies to the first item added after it, then normal prices again
      this.linePrices[index] = this.pendingPrice;
      this.pendingPrice = null;
    }
  }

  // Type a price in the scan field, then click New Price
  applyNewPrice(): void {
    const text = this.searchText.trim();
    const price = parseFloat(text);
    if (!text || isNaN(price) || !/^\d+(\.\d{1,2})?$/.test(text)) {
      alert('Type the new price in the scan field first, then click New Price.');
      return;
    }
    if (price <= 0) {
      alert('New price must be more than 0.');
      return;
    }
    this.pendingPrice = this.round2(price);
    this.searchText = '';
  }

  cancelNewPrice(): void {
    this.pendingPrice = null;
  }

  getLinePrice(idx: number): number {
    return this.linePrices[idx] ?? this.items[idx].price;
  }

  selectCartItem(index: number): void {
    this.selectedCartIndex = index;
  }

  increaseQty(index: number, event?: Event): void {
    if (event) event.stopPropagation();
    this.cart[index] = (this.cart[index] || 0) + 1;
  }

  decreaseQty(index: number, event?: Event): void {
    if (event) event.stopPropagation();
    if (this.cart[index] > 1) {
      this.cart[index]--;
    } else {
      this.voidCartItem(index);
    }
  }

  voidCartItem(index: number, event?: Event): void {
    if (event) event.stopPropagation();
    delete this.cart[index];
    delete this.lineDiscounts[index];
    delete this.linePrices[index];
    delete this.lineImeis[index];
    if (this.selectedCartIndex === index) {
      this.selectedCartIndex = null;
    }
  }

  voidSelectedItem(): void {
    if (this.selectedCartIndex !== null && this.cart[this.selectedCartIndex] !== undefined) {
      this.voidCartItem(this.selectedCartIndex);
      return;
    }
    const keys = Object.keys(this.cart);
    if (keys.length > 0) {
      const lastKey = parseInt(keys[keys.length - 1]);
      this.voidCartItem(lastKey);
    } else {
      alert('Cart is empty. No item selected to void.');
    }
  }

  getCartEntries() {
    return Object.keys(this.cart).map(key => {
      const idx = parseInt(key);
      const gross = this.getLineGross(idx);
      const discount = this.discountAmount(this.lineDiscounts[idx], gross);
      return {
        itemIndex: idx,
        item: this.items[idx],
        qty: this.cart[idx],
        price: this.getLinePrice(idx),
        priceOverride: this.linePrices[idx] !== undefined,
        imei: this.lineImeis[idx] || null,
        gross,
        discount,
        discountLabel: this.discountLabel(this.lineDiscounts[idx]),
        subtotal: this.round2(gross - discount)
      };
    });
  }

  private getLineGross(idx: number): number {
    return this.round2(this.getLinePrice(idx) * this.cart[idx]);
  }

  // Sub total is after line discounts, before the bill discount
  getSubTotal(): number {
    return this.round2(this.getCartEntries().reduce((sum, e) => sum + e.subtotal, 0));
  }

  getBillDiscount(): number {
    return this.discountAmount(this.billDiscount, this.getSubTotal());
  }

  // Net value the customer pays
  getCartTotal(): number {
    return this.round2(this.getSubTotal() - this.getBillDiscount());
  }

  // ---------- Discounts ----------

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  // Never negative and never more than the base it is taken from
  private discountAmount(d: Discount | null | undefined, base: number): number {
    if (!d || base <= 0) return 0;
    const raw = d.type === 'pct' ? base * d.value / 100 : d.value;
    return this.round2(Math.min(Math.max(raw, 0), base));
  }

  discountLabel(d: Discount | null | undefined): string {
    if (!d) return '';
    return d.type === 'pct' ? `${d.value}%` : `Rs ${d.value.toLocaleString()}`;
  }

  private hasSelectedLine(): boolean {
    return this.selectedCartIndex !== null && this.cart[this.selectedCartIndex] !== undefined;
  }

  openDiscount(): void {
    if (Object.keys(this.cart).length === 0) {
      alert('Cart is empty. Add an item first.');
      return;
    }
    this.setDiscountTarget(this.hasSelectedLine() ? 'line' : 'bill');
    this.showDiscount = true;
  }

  openBillDiscount(): void {
    if (Object.keys(this.cart).length === 0) return;
    this.setDiscountTarget('bill');
    this.showDiscount = true;
  }

  closeDiscount(): void {
    this.showDiscount = false;
  }

  setDiscountTarget(target: 'line' | 'bill'): void {
    if (target === 'line' && !this.hasSelectedLine()) return;
    this.discountTarget = target;
    const current = this.currentDiscount();
    if (current) this.discountType = current.type;
    this.discountInput = current ? String(current.value) : '';
    this.discountError = '';
  }

  toggleDiscountType(): void {
    this.discountType = this.discountType === 'pct' ? 'amt' : 'pct';
    this.discountError = '';
  }

  setDiscountType(type: DiscountType): void {
    this.discountType = type;
    this.discountError = '';
  }

  private currentDiscount(): Discount | null {
    if (this.discountTarget === 'line') {
      return this.lineDiscounts[this.selectedCartIndex as number] || null;
    }
    return this.billDiscount;
  }

  discountTargetName(): string {
    if (this.discountTarget === 'line' && this.hasSelectedLine()) {
      return this.items[this.selectedCartIndex as number].name;
    }
    return 'Sub total';
  }

  // The amount the discount is taken from
  discountBase(): number {
    if (this.discountTarget === 'line' && this.hasSelectedLine()) {
      return this.getLineGross(this.selectedCartIndex as number);
    }
    // A bill discount applies to the sub total after line discounts
    return this.getSubTotal();
  }

  discountPreview(): number {
    const value = parseFloat(this.discountInput);
    if (isNaN(value)) return 0;
    return this.discountAmount({ type: this.discountType, value }, this.discountBase());
  }

  applyDiscount(): void {
    const value = parseFloat(this.discountInput);
    const base = this.discountBase();
    if (isNaN(value) || value < 0) {
      this.discountError = 'Enter a discount of 0 or more.';
      return;
    }
    if (this.discountType === 'pct' && value > 100) {
      this.discountError = 'Percentage cannot be more than 100.';
      return;
    }
    if (this.discountType === 'amt' && value > base) {
      this.discountError = `Amount cannot be more than Rs ${base.toLocaleString()}.`;
      return;
    }
    if (value === 0) {
      this.removeDiscount();
      return;
    }
    const discount: Discount = { type: this.discountType, value: this.round2(value) };
    if (this.discountTarget === 'line') {
      this.lineDiscounts[this.selectedCartIndex as number] = discount;
    } else {
      this.billDiscount = discount;
    }
    this.closeDiscount();
  }

  removeDiscount(): void {
    if (this.discountTarget === 'line') {
      delete this.lineDiscounts[this.selectedCartIndex as number];
    } else {
      this.billDiscount = null;
    }
    this.closeDiscount();
  }

  getBalance(): number {
    return (this.tenderedAmount || 0) - this.getCartTotal();
  }

  openKeypad(): void {
    this.showKeypad = true;
    this.keypadInputStr = this.tenderedAmount ? this.tenderedAmount.toString() : '';
  }

  closeKeypad(): void {
    this.showKeypad = false;
  }

  keypadPress(key: string): void {
    if (key === 'C') {
      this.keypadInputStr = '';
    } else if (key === 'BS') {
      this.keypadInputStr = this.keypadInputStr.slice(0, -1);
    } else if (key === '.') {
      if (!this.keypadInputStr.includes('.')) {
        this.keypadInputStr = this.keypadInputStr ? this.keypadInputStr + '.' : '0.';
      }
    } else {
      this.keypadInputStr += key;
    }
    this.tenderedAmount = parseFloat(this.keypadInputStr) || 0;
  }

  setPreset(type: string): void {
    if (type === 'exact') {
      this.tenderedAmount = this.getCartTotal();
      this.keypadInputStr = this.tenderedAmount.toString();
    }
  }

  addPreset(amount: number): void {
    this.tenderedAmount = (this.tenderedAmount || 0) + amount;
    this.keypadInputStr = this.tenderedAmount.toString();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (this.showRecall && event.key === 'Escape') {
      this.closeRecall();
      return;
    }
    if (this.showDiscount) {
      if (event.key === 'Escape') this.closeDiscount();
      return;
    }
    if (this.showFloat || this.showClose) {
      if (event.key === 'Escape') this.closeCashModals();
      return;
    }
    if (!this.showKeypad) {
      const target = event.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
      if (!isInput && !this.showRecall && !this.showDiscount && !this.showFloat && !this.showClose && !this.showPaymentDetailModal && !this.showPaidModal && !this.showCashierReports) {
        const scanInput = document.getElementById('pos-search-input') as HTMLInputElement;
        if (scanInput && event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
          scanInput.focus();
        }
      }
      return;
    }
    if (event.key >= '0' && event.key <= '9') {
      this.keypadPress(event.key);
    } else if (event.key === '.') {
      this.keypadPress('.');
    } else if (event.key === 'Backspace') {
      this.keypadPress('BS');
    } else if (event.key === 'Escape' || event.key === 'Enter') {
      this.closeKeypad();
    }
  }

  selectPaymentMethod(method: string): void {
    const total = this.getCartTotal();
    this.selectedPaymentMethod = method;

    if (method === 'Cash') {
      this.tenderedAmount = total;
      this.keypadInputStr = total.toString();
      this.paymentDetails = {};
      this.openKeypad();
      return;
    }

    if (method === 'Visa' || method === 'MasterCard' || method === 'Amex') {
      this.tenderedAmount = total;
      this.cardForm.cardType = method;
      this.cardForm.authCode = '';
      this.cardForm.last4 = '';
      this.paymentModalType = 'card';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Cheque') {
      this.tenderedAmount = total;
      this.chequeForm.chequeNo = '';
      this.paymentModalType = 'cheque';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Credit') {
      this.tenderedAmount = 0;
      this.paymentModalType = 'credit';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Split') {
      const half = Math.round(total / 2);
      this.splitForm.cashAmount = half;
      this.splitForm.secondaryAmount = total - half;
      this.splitForm.secondaryMethod = 'Visa';
      this.splitForm.reference = '';
      this.tenderedAmount = total;
      this.paymentModalType = 'split';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Gift Voucher') {
      this.voucherForm.voucherAmount = total;
      this.voucherForm.voucherNo = '';
      this.tenderedAmount = total;
      this.paymentModalType = 'voucher';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Loyalty') {
      this.loyaltyForm.pointsToRedeem = Math.min(this.loyaltyForm.availablePoints, total);
      this.tenderedAmount = total;
      this.paymentModalType = 'loyalty';
      this.showPaymentDetailModal = true;
      return;
    }

    if (method === 'Credit Note') {
      this.creditNoteForm.amount = total;
      this.creditNoteForm.creditNoteNo = '';
      this.tenderedAmount = total;
      this.paymentModalType = 'credit_note';
      this.showPaymentDetailModal = true;
      return;
    }
  }

  openPaymentDetailModal(method?: string): void {
    if (method) this.selectPaymentMethod(method);
    else this.showPaymentDetailModal = true;
  }

  closePaymentDetailModal(): void {
    this.showPaymentDetailModal = false;
  }

  confirmCardPayment(): void {
    this.paymentDetails = {
      method: this.cardForm.cardType,
      authCode: this.cardForm.authCode || 'ONLINE',
      last4: this.cardForm.last4 || '****',
      bank: this.cardForm.bank
    };
    this.tenderedAmount = this.getCartTotal();
    this.showPaymentDetailModal = false;
  }

  confirmChequePayment(): void {
    if (!this.chequeForm.chequeNo.trim()) {
      alert('Cheque number is required.');
      return;
    }
    this.paymentDetails = {
      chequeNo: this.chequeForm.chequeNo.trim(),
      bankName: this.chequeForm.bankName,
      branch: this.chequeForm.branch,
      chequeDate: this.chequeForm.chequeDate
    };
    this.tenderedAmount = this.getCartTotal();
    this.showPaymentDetailModal = false;
  }

  confirmCreditPayment(): void {
    this.paymentDetails = {
      customerPhone: this.creditForm.customerPhone,
      customerName: this.creditForm.customerName,
      dueDate: this.creditForm.dueDate
    };
    this.selectedCustomer = `${this.creditForm.customerPhone} - ${this.creditForm.customerName} (Credit)`;
    this.tenderedAmount = 0;
    this.showPaymentDetailModal = false;
  }

  onSplitCashChange(): void {
    const total = this.getCartTotal();
    const c = Math.max(0, this.splitForm.cashAmount || 0);
    this.splitForm.secondaryAmount = Math.max(0, total - c);
  }

  confirmSplitPayment(): void {
    const total = this.getCartTotal();
    const sum = (this.splitForm.cashAmount || 0) + (this.splitForm.secondaryAmount || 0);
    if (sum !== total) {
      alert(`Split allocation (Rs. ${sum}) must equal total payable (Rs. ${total}).`);
      return;
    }
    this.paymentDetails = {
      cashAmount: this.splitForm.cashAmount,
      secondaryAmount: this.splitForm.secondaryAmount,
      secondaryMethod: this.splitForm.secondaryMethod,
      reference: this.splitForm.reference
    };
    this.tenderedAmount = total;
    this.showPaymentDetailModal = false;
  }

  confirmVoucherPayment(): void {
    if (!this.voucherForm.voucherNo.trim()) {
      alert('Voucher serial number is required.');
      return;
    }
    this.paymentDetails = {
      voucherNo: this.voucherForm.voucherNo.trim(),
      voucherAmount: this.voucherForm.voucherAmount
    };
    this.tenderedAmount = this.getCartTotal();
    this.showPaymentDetailModal = false;
  }

  confirmLoyaltyPayment(): void {
    this.paymentDetails = {
      loyaltyPhone: this.loyaltyForm.phone,
      pointsRedeemed: this.loyaltyForm.pointsToRedeem,
      redeemedValue: this.loyaltyForm.pointsToRedeem
    };
    this.tenderedAmount = this.getCartTotal();
    this.showPaymentDetailModal = false;
  }

  confirmCreditNotePayment(): void {
    if (!this.creditNoteForm.creditNoteNo.trim()) {
      alert('Credit note number is required.');
      return;
    }
    this.paymentDetails = {
      creditNoteNo: this.creditNoteForm.creditNoteNo.trim(),
      amount: this.creditNoteForm.amount
    };
    this.tenderedAmount = this.getCartTotal();
    this.showPaymentDetailModal = false;
  }

  getPaymentDetailSummary(): string {
    const pm = this.selectedPaymentMethod;
    const pd = this.paymentDetails;
    if (pm === 'Visa' || pm === 'MasterCard' || pm === 'Amex') {
      return `Auth: ${pd.authCode || 'Pending'} | ${pd.bank || 'Bank'}`;
    }
    if (pm === 'Cheque') {
      return `Chq #${pd.chequeNo || '—'} (${pd.bankName || 'Bank'})`;
    }
    if (pm === 'Credit') {
      return `Cust: ${pd.customerName || this.selectedCustomer}`;
    }
    if (pm === 'Split') {
      return `Cash Rs. ${(pd.cashAmount || 0).toLocaleString()} + ${pd.secondaryMethod || 'Card'} Rs. ${(pd.secondaryAmount || 0).toLocaleString()}`;
    }
    if (pm === 'Gift Voucher') {
      return `Voucher: ${pd.voucherNo || '—'}`;
    }
    if (pm === 'Loyalty') {
      return `Redeemed: ${pd.pointsRedeemed || 0} pts`;
    }
    if (pm === 'Credit Note') {
      return `CN: ${pd.creditNoteNo || '—'}`;
    }
    return '';
  }

  checkout(): void {
    const entries = this.getCartEntries();
    if (entries.length === 0) {
      alert('Cart is empty!');
      return;
    }
    const total = this.getCartTotal();
    const balance = this.getBalance();
    const lineDisc = entries.reduce((sum, e) => sum + e.discount, 0);
    const totalDisc = this.round2(lineDisc + this.getBillDiscount());
    const summary = `Discount: Rs ${totalDisc.toLocaleString()}\nTotal: Rs ${total.toLocaleString()}\n` +
      `Tendered: Rs ${this.tenderedAmount.toLocaleString()}\nBalance: Rs ${balance.toLocaleString()}`;

    // Saved so Copy Line can reprint it later
    const sale: any = {
      invoice_no: this.currentInvoiceNo,
      created_at: '',
      cashier: this.cashier,
      salesman: this.selectedSalesman,
      location: this.location,
      payment_method: this.selectedPaymentMethod,
      payment_details: this.paymentDetails,
      customer: this.selectedCustomer || 'Cash Customer',
      terminal: this.terminal,
      subtotal: this.getSubTotal(),
      discount: this.getBillDiscount(),
      discount_label: this.discountLabel(this.billDiscount) || null,
      total,
      tendered: this.selectedPaymentMethod === 'Credit' ? 0 : (this.tenderedAmount || total),
      items: entries.map(e => ({
        code: e.item.code,
        name: e.item.name,
        imei_number: e.imei || null,
        qty: e.qty,
        price: e.price,
        discount: e.discount,
        discount_label: e.discountLabel || null,
        total: e.subtotal
      }))
    };

    this.apiPost<any>('create_sale', sale).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          const inv = res.invoice_no || this.currentInvoiceNo;
          if (res.next_invoice_no) {
            this.currentInvoiceNo = res.next_invoice_no;
          } else {
            const nextSeq = (parseInt(inv.slice(-7)) || 1) + 1;
            this.currentInvoiceNo = 'INMW' + this.getTerminalDigit() + String(nextSeq).padStart(7, '0');
          }
          alert(`Checkout success! Bill ${inv}\nSalesman: ${this.selectedSalesman}\n${summary}`);
          this.clearCart();
          this.loadCashStatus();
        } else {
          alert('Sale was NOT saved: ' + (res?.message || 'unknown server response') + '\nThe bill is still open.');
        }
      },
      error: (err) => {
        console.warn('create_sale API unavailable, saving on this terminal only', err);
        const local: SaleRecord = {
          ...sale,
          invoice_no: 'INL' + Date.now().toString().slice(-8),
          created_at: new Date().toISOString(),
          local: true
        };
        this.writeLocal(LOCAL_SALES_KEY, [local, ...this.readLocal<SaleRecord>(LOCAL_SALES_KEY)]);
        alert(`Server not reachable. Bill ${local.invoice_no} saved on this terminal only, stock not updated.\n${summary}`);
        this.clearCart();
      }
    });
  }

  clearCart(): void {
    this.cart = {};
    this.lineDiscounts = {};
    this.linePrices = {};
    this.lineImeis = {};
    this.pendingPrice = null;
    this.billDiscount = null;
    this.tenderedAmount = 0;
    this.selectedCartIndex = null;
    this.selectedPaymentMethod = 'Cash';
    this.paymentDetails = {};
  }

  logOff(): void {
    const hasActiveShift = !!this.cashSession && this.cashSession.status !== 'Closed' && !this.cashSession.closed_at;
    const msg = hasActiveShift
      ? 'A cash shift is still active on this terminal.\nEnsure you have closed cash or printed Z-Reading if end-of-day.\n\nDo you want to log off now?'
      : 'Are you sure you want to log off?';

    if (confirm(msg)) {
      this.authService.logout();
      window.location.href = '/auth/login';
    }
  }

  // ---------- Cashier Reports Menu ----------

  openCashierReports(): void {
    this.selectedReportIndex = 0;
    this.showCashierReports = true;
    this.loadCashierReportsData();
  }

  loadCashierReportsData(): void {
    this.apiGet<any>('cashier_reports_data', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res?.status === 'success' && res.data) {
          this.cashierReportsData = res.data;
          if (res.data.session) {
            this.cashSession = this.toCashSummary(res.data.session);
          }
        }
      },
      error: (err) => console.warn('Could not load cashier reports data', err)
    });
  }

  closeCashierReports(): void {
    this.showCashierReports = false;
  }

  selectReportRow(index: number): void {
    this.selectedReportIndex = index;
  }

  onReportRowDoubleClick(index: number): void {
    this.selectedReportIndex = index;
    this.viewSelectedReport();
  }

  moveReportSelection(delta: number): void {
    const next = this.selectedReportIndex + delta;
    if (next >= 0 && next < this.cashierReportsList.length) {
      this.selectedReportIndex = next;
    }
  }

  viewSelectedReport(): void {
    const report = this.cashierReportsList[this.selectedReportIndex];
    if (!report) return;
    this.executeReportAction(report, 'view');
  }

  selectSelectedReport(): void {
    const report = this.cashierReportsList[this.selectedReportIndex];
    if (!report) return;
    this.executeReportAction(report, 'print');
  }

  closeReportDetailModal(): void {
    this.showReportDetailModal = false;
    this.activeReportDetail = null;
  }

  printCurrentReportDetail(): void {
    if (!this.activeReportDetail) return;
    this.printSlip(this.activeReportDetail.title, this.activeReportDetail.rawBody || this.activeReportDetail.contentHtml);
  }

  executeReportAction(report: { id: string; title: string; description: string }, mode: 'view' | 'print'): void {
    const esc = this.esc;
    const money = this.money;
    const nowStr = new Date().toLocaleString();
    const session = (this.cashSession && this.cashSession.counted_cash !== undefined && this.cashSession.counted_cash !== null)
      ? this.cashSession
      : (this.lastClosedSession || this.cashSession);

    if (report.id === 'cashier_reading') {
      // Temporary drawer audit check to check shortage or excess without closing the shift
      this.closeCashierReports();
      this.promptDrawerCheckForCashierReading(mode);
      return;
    }

    if (report.id === 'z_reading') {
      const hasCounted = (session && session.counted_cash !== undefined && session.counted_cash !== null) ||
                         (this.lastClosedSession && this.lastClosedSession.counted_cash !== undefined && this.lastClosedSession.counted_cash !== null);

      if (!hasCounted) {
        this.closeCashierReports();
        this.promptDrawerCollectionForZReading(mode);
        return;
      }
    }
    const floatAmt = session ? session.opening_float : 0;
    const cashSales = session ? session.cash_sales_total : 0;
    const cashSalesCount = session ? session.cash_sales_count : 0;
    const cardSales = session ? (session.card_sales_total || 0) : 0;
    const cardSalesCount = session ? (session.card_sales_count || 0) : 0;
    const paidInTotal = session ? (session.paid_in_total || 0) : 0;
    const paidOutTotal = session ? (session.paid_out_total || 0) : 0;
    const totalNetSales = cashSales + cardSales;
    const expectedCash = session ? session.expected_cash : floatAmt + cashSales + paidInTotal - paidOutTotal;

    const repData = this.cashierReportsData;

    let bodyHtml = '';
    let rawPrintHtml = '';

    switch (report.id) {
      case 'x_reading': {
        rawPrintHtml = `
          <h2>X READING - CURRENT SALE REPORT</h2>
          <div class="c">${esc(this.location)}</div>
          <hr>
          <div>Terminal: ${esc(this.terminal)} &nbsp; Cashier: ${esc(this.cashier)}</div>
          <div>Date: ${esc(nowStr)}</div>
          <div>Shift Opened: ${session ? esc(new Date(session.opened_at).toLocaleString()) : 'N/A'}</div>
          <hr>
          <div class="row"><span>Opening Float</span><span>${money(floatAmt)}</span></div>
          <div class="row"><span>Cash Sales (${cashSalesCount})</span><span>${money(cashSales)}</span></div>
          <div class="row"><span>Card Sales (${cardSalesCount})</span><span>${money(cardSales)}</span></div>
          <div class="row"><span>Paid In / Extra Float</span><span>+${money(paidInTotal)}</span></div>
          <div class="row"><span>Paid Out Disbursements</span><span>-${money(paidOutTotal)}</span></div>
          <div class="row"><span>Total Net Sales</span><span>${money(totalNetSales)}</span></div>
          <div class="tot"><span>EXPECTED CASH</span><span>${money(expectedCash)}</span></div>
          <hr>
          <div class="c">*** MID SHIFT READ ***</div>`;
        bodyHtml = `
          <div class="rep-summary-grid">
            <div class="rep-kpi"><span class="kpi-lbl">Opening Float</span><span class="kpi-val">${money(floatAmt)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Cash Sales (${cashSalesCount})</span><span class="kpi-val">${money(cashSales)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Card Sales (${cardSalesCount})</span><span class="kpi-val">${money(cardSales)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Paid In / Out</span><span class="kpi-val">+${money(paidInTotal)} / -${money(paidOutTotal)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Expected Cash</span><span class="kpi-val">${money(expectedCash)}</span></div>
          </div>
          <table class="rep-table">
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Terminal</td><td>${esc(this.terminal)}</td></tr>
            <tr><td>Cashier</td><td>${esc(this.cashier)}</td></tr>
            <tr><td>Shift Opened</td><td>${session ? esc(new Date(session.opened_at).toLocaleString()) : 'No Active Shift'}</td></tr>
            <tr><td>Opening Float</td><td>${money(floatAmt)}</td></tr>
            <tr><td>Cash Sales Count</td><td>${cashSalesCount}</td></tr>
            <tr><td>Total Cash Collected</td><td>${money(cashSales)}</td></tr>
            <tr><td>Card Sales (${cardSalesCount})</td><td>${money(cardSales)}</td></tr>
            <tr><td>Paid In / Top-Up Total</td><td>+${money(paidInTotal)}</td></tr>
            <tr><td>Paid Out Disbursements</td><td>-${money(paidOutTotal)}</td></tr>
            <tr><td>Total Net Sales</td><td>${money(totalNetSales)}</td></tr>
            <tr><td>Current Expected Drawer Cash</td><td><b>${money(expectedCash)}</b></td></tr>
          </table>`;
        break;
      }
      case 'z_reading': {
        const zDisc = repData?.discounts || { bill_count: 0, bill_total: 0, line_count: 0, line_total: 0, total: 0 };
        const zGross = this.round2(cashSales + cardSales);
        const zNetSale = this.round2(zGross - (zDisc.total || 0));
        const zTotalEarns = this.round2(zNetSale + paidInTotal);
        const zItemWise: any[] = repData?.item_wise || [];
        const zBillCount = cashSalesCount + cardSalesCount;
        const zNum = session?.last_invoice_no || ('INMW' + this.getTerminalDigit() + '0000000');
        const zReadNo = session?.z_reading_no || (this.lastClosedSession?.z_reading_no || 865);

        const declaredCash = (session?.counted_cash !== undefined && session?.counted_cash !== null)
          ? session.counted_cash
          : (this.lastClosedSession?.counted_cash !== undefined && this.lastClosedSession?.counted_cash !== null ? this.lastClosedSession.counted_cash : null);

        const diff = (session?.difference !== undefined && session?.difference !== null)
          ? session.difference
          : (this.lastClosedSession?.difference !== undefined && this.lastClosedSession?.difference !== null
              ? this.lastClosedSession.difference
              : (declaredCash !== null ? this.round2(declaredCash - expectedCash) : null));

        let diffLabel = 'Cash Short / Excess';
        let diffReceiptLabel = 'Cash Excess';
        let diffValStr = '0.00';
        let diffColor = '#003366';

        if (diff !== null) {
          if (diff < 0) {
            diffLabel = 'Cash Shortage';
            diffReceiptLabel = 'Cash Shortage';
            diffValStr = '-' + money(Math.abs(diff));
            diffColor = '#c62828';
          } else if (diff > 0) {
            diffLabel = 'Cash Excess';
            diffReceiptLabel = 'Cash Excess';
            diffValStr = '+' + money(diff);
            diffColor = '#2e7d32';
          } else {
            diffLabel = 'Cash Balanced';
            diffReceiptLabel = 'Cash Short / Excess';
            diffValStr = '0.00 (Balanced)';
            diffColor = '#1565c0';
          }
        }

        rawPrintHtml = `
          <h2>Z READING (${zReadNo})</h2>
          <div class="c">${esc(this.location)}</div>
          <hr>
          <div class="row"><span>Terminal: ${esc(this.terminal)}</span><span>Ref # ${esc(zNum)}</span></div>
          <div class="row"><span>Cashier: ${esc(this.cashier)}</span><span>Date: ${esc(new Date().toLocaleDateString())}</span></div>
          <hr>
          <div class="row"><span>Gross Sale</span><span>${money(zGross)}</span></div>
          <div class="row"><span>Exchange &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Line Discount &nbsp;&nbsp;&nbsp; ${zDisc.line_count}</span><span>${money(zDisc.line_total)}</span></div>
          <div class="row"><span>Subtotal Discount &nbsp;&nbsp;&nbsp; ${zDisc.bill_count}</span><span>${money(zDisc.bill_total)}</span></div>
          <div class="tot"><span>Net Sale</span><span>${money(zNetSale)}</span></div>
          <div class="row"><span>Nbt</span><span>0.00</span></div>
          <div class="row"><span>Vat</span><span>0.00</span></div>
          <div class="tot"><span>Sales With Tax</span><span>${money(zNetSale)}</span></div>
          <div class="row"><span>Gift Voucher Sale &nbsp;&nbsp;&nbsp; 0.00</span><span>0.00</span></div>
          <div class="row"><span>Loyalty Card Issue</span><span>0.00</span></div>
          <div class="row"><span>Collection For Credit</span><span>0.00</span></div>
          <div class="row"><span>Advance Receive</span><span>0.00</span></div>
          <div class="row"><span>Paid In &amp; Receives</span><span>${money(paidInTotal)}</span></div>
          <div class="tot"><span>Total Earns</span><span>${money(zTotalEarns)}</span></div>
          <hr>
          <div class="row"><span>Void &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Cancel &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <hr>
          <div class="row"><span>Cash Sale</span><span>${money(cashSales)}</span></div>
          <div class="row"><span>Cash Refund &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Cash For Voucher Sale</span><span>0.00</span></div>
          <div class="row"><span>Cash For Advance</span><span>0.00</span></div>
          <div class="row"><span>Cash For Credit Sale</span><span>0.00</span></div>
          <div class="row"><span>Cash For Loyalty</span><span>0.00</span></div>
          <div class="row"><span>Other Cash</span><span>0.00</span></div>
          <div class="row"><span>Float Cash</span><span>${money(floatAmt)}</span></div>
          <div class="row"><span>Paid In Cash</span><span>${money(paidInTotal)}</span></div>
          <div class="row"><span>Paid Out Cash</span><span>${money(paidOutTotal)}</span></div>
          <div class="row"><span>Currency Change</span><span>0.00</span></div>
          <div class="tot"><span>Total Cash In Hand</span><span>${money(expectedCash)}</span></div>
          <div class="row"><span>Declared Cash In Hand</span><span>${declaredCash !== null ? money(declaredCash) : '0.00'}</span></div>
          <div class="row" style="font-weight:bold"><span>${esc(diffReceiptLabel)}</span><span>${diffValStr}</span></div>
          <div class="row"><span>Total Credit Cards</span><span>${money(cardSales)}</span></div>
          <div class="row"><span>Total Non Cash</span><span>0.00</span></div>
          <hr>
          <div><b>CREDIT CARD COLLECTION</b></div>
          <div class="row"><span>Master Card &nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Visa Card &nbsp;&nbsp; ${cardSalesCount}</span><span>${money(cardSales)}</span></div>
          <div class="tot"><span>CREDIT CARD TOTAL</span><span>${money(cardSales)}</span></div>
          <hr>
          <div><b>NON CASH COLLECTION</b></div>
          <div class="row"><span>Direct Deposit &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="tot"><span>NON CASH TOTAL</span><span>0.00</span></div>
          <hr>
          <div><b>CURRENCY COLLECTION</b></div>
          <div class="tot"><span>TOTAL</span><span></span></div>
          <hr>
          <div><b>POS Category Sales</b></div>
          <div class="row" style="text-decoration:underline"><span>Description</span><span>Qty &nbsp;&nbsp; Net Sale</span></div>
          $` + zItemWise.map((i: any) => `<div class="row"><span>` + esc(i.item_name) + `</span><span>` + i.total_qty + ` &nbsp; ` + money(parseFloat(i.total_amount || 0)) + `</span></div>`).join('') + `
          <div class="tot"><span></span><span>${zBillCount} &nbsp; ${money(zGross)}</span></div>
          <hr>
          <div class="row"><span>Time: ${esc(new Date().toLocaleTimeString())}</span><span>No Of Bills: ${zBillCount}</span></div>
          <hr>
          <div style="margin-top:22px">Cashier: ____________________</div>
          <div style="margin-top:16px">Received By: ____________________</div>`;
        bodyHtml = `
          <div class="rep-summary-grid">
            <div class="rep-kpi"><span class="kpi-lbl">Gross Sale</span><span class="kpi-val">${money(zGross)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Net Sale</span><span class="kpi-val">${money(zNetSale)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Expected Cash</span><span class="kpi-val">${money(expectedCash)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Declared Cash</span><span class="kpi-val">${declaredCash !== null ? money(declaredCash) : '0.00'}</span></div>
            <div class="rep-kpi" style="border-left:4px solid ${diffColor}"><span class="kpi-lbl">${diffLabel}</span><span class="kpi-val" style="color:${diffColor}">${diffValStr}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">No. of Bills</span><span class="kpi-val">${zBillCount}</span></div>
          </div>
          <table class="rep-table">
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">SALES SUMMARY</th></tr>
            <tr><th>Field</th><th>Count</th><th>Amount</th></tr>
            <tr><td>Gross Sale</td><td></td><td>${money(zGross)}</td></tr>
            <tr><td>Exchange</td><td>0</td><td>0.00</td></tr>
            <tr><td>Line Discount</td><td>${zDisc.line_count}</td><td>${money(zDisc.line_total)}</td></tr>
            <tr><td>Subtotal Discount</td><td>${zDisc.bill_count}</td><td>${money(zDisc.bill_total)}</td></tr>
            <tr><td><b>Net Sale</b></td><td></td><td><b>${money(zNetSale)}</b></td></tr>
            <tr><td>NBT</td><td></td><td>0.00</td></tr>
            <tr><td>VAT</td><td></td><td>0.00</td></tr>
            <tr><td><b>Sales With Tax</b></td><td></td><td><b>${money(zNetSale)}</b></td></tr>
            <tr><td>Paid In &amp; Receives</td><td></td><td>${money(paidInTotal)}</td></tr>
            <tr><td><b>Total Earns</b></td><td></td><td><b>${money(zTotalEarns)}</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">VOID / CANCEL</th></tr>
            <tr><td>Void</td><td>0</td><td>0.00</td></tr>
            <tr><td>Cancel</td><td>0</td><td>0.00</td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CASH RECONCILIATION</th></tr>
            <tr><td>Cash Sale</td><td>${cashSalesCount}</td><td>${money(cashSales)}</td></tr>
            <tr><td>Cash Refund</td><td>0</td><td>0.00</td></tr>
            <tr><td>Cash For Voucher Sale</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Advance</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Credit Sale</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Loyalty</td><td></td><td>0.00</td></tr>
            <tr><td>Other Cash</td><td></td><td>0.00</td></tr>
            <tr><td>Float Cash</td><td></td><td>${money(floatAmt)}</td></tr>
            <tr><td>Paid In Cash</td><td></td><td>${money(paidInTotal)}</td></tr>
            <tr><td>Paid Out Cash</td><td></td><td>${money(paidOutTotal)}</td></tr>
            <tr><td>Currency Change</td><td></td><td>0.00</td></tr>
            <tr><td><b>Total Cash In Hand (Expected)</b></td><td></td><td><b>${money(expectedCash)}</b></td></tr>
            <tr><td><b>Declared Cash In Hand (Counted)</b></td><td></td><td><b>${declaredCash !== null ? money(declaredCash) : '0.00'}</b></td></tr>
            <tr style="background:${diff !== null ? (diff < 0 ? '#ffebee' : diff > 0 ? '#e8f5e9' : '#f0fdf4') : 'transparent'}">
              <td><b style="color:${diffColor}">${diffLabel}</b></td>
              <td></td>
              <td><b style="color:${diffColor};font-size:15px">${diffValStr}</b></td>
            </tr>
            <tr><td>Total Credit Cards</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
            <tr><td>Total Non Cash</td><td>0</td><td>0.00</td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CREDIT CARD COLLECTION</th></tr>
            <tr><td>Master Card</td><td>0</td><td>0.00</td></tr>
            <tr><td>Visa Card</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
            <tr><td><b>Credit Card Total</b></td><td></td><td><b>${money(cardSales)}</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">NON CASH COLLECTION</th></tr>
            <tr><td>Direct Deposit</td><td>0</td><td>0.00</td></tr>
            <tr><td><b>Non Cash Total</b></td><td></td><td><b>0.00</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">POS CATEGORY SALES</th></tr>
            <tr><th>Description</th><th>Qty</th><th>Net Sale</th></tr>
            $` + zItemWise.map((i: any) => `<tr><td>` + esc(i.item_name) + `</td><td>` + i.total_qty + `</td><td>` + money(parseFloat(i.total_amount || 0)) + `</td></tr>`).join('') + `
            <tr><td><b>Total</b></td><td><b>${zBillCount}</b></td><td><b>${money(zGross)}</b></td></tr>
          </table>`;
        break;
      }
      case 'cashier_reading': {
        const cDisc = repData?.discounts || { bill_count: 0, bill_total: 0, line_count: 0, line_total: 0, total: 0 };
        const cGross = this.round2(cashSales + cardSales);
        const cNetSale = this.round2(cGross - (cDisc.total || 0));
        const cTotalEarns = this.round2(cNetSale + paidInTotal);
        const cItemWise: any[] = repData?.item_wise || [];
        const cBillCount = cashSalesCount + cardSalesCount;
        const cNum = session?.session_id ? ('CR' + String(session.session_id).padStart(6, '0')) : 'CR000001';

        rawPrintHtml = `
          <h2>CASHIER READING</h2>
          <div class="c">${esc(this.location)}</div>
          <hr>
          <div class="row"><span>Terminal: ${esc(this.terminal)}</span><span>Ref # ${esc(cNum)}</span></div>
          <div class="row"><span>Cashier: ${esc(this.cashier)}</span><span>Date: ${esc(new Date().toLocaleDateString())}</span></div>
          <hr>
          <div class="row"><span>Gross Sale</span><span>${money(cGross)}</span></div>
          <div class="row"><span>Exchange &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Line Discount &nbsp;&nbsp;&nbsp; ${cDisc.line_count}</span><span>${money(cDisc.line_total)}</span></div>
          <div class="row"><span>Subtotal Discount &nbsp;&nbsp;&nbsp; ${cDisc.bill_count}</span><span>${money(cDisc.bill_total)}</span></div>
          <div class="tot"><span>Net Sale</span><span>${money(cNetSale)}</span></div>
          <div class="row"><span>Nbt</span><span>0.00</span></div>
          <div class="row"><span>Vat</span><span>0.00</span></div>
          <div class="tot"><span>Sales With Tax</span><span>${money(cNetSale)}</span></div>
          <div class="row"><span>Gift Voucher Sale &nbsp;&nbsp;&nbsp; 0.00</span><span>0.00</span></div>
          <div class="row"><span>Loyalty Card Issue</span><span>0.00</span></div>
          <div class="row"><span>Collection For Credit</span><span>0.00</span></div>
          <div class="row"><span>Advance Receive</span><span>0.00</span></div>
          <div class="row"><span>Paid In &amp; Receives</span><span>${money(paidInTotal)}</span></div>
          <div class="tot"><span>Total Earns</span><span>${money(cTotalEarns)}</span></div>
          <hr>
          <div class="row"><span>Void &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Cancel &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <hr>
          <div class="row"><span>Cash Sale</span><span>${money(cashSales)}</span></div>
          <div class="row"><span>Cash Refund &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Cash For Voucher Sale</span><span>0.00</span></div>
          <div class="row"><span>Cash For Advance</span><span>0.00</span></div>
          <div class="row"><span>Cash For Credit Sale</span><span>0.00</span></div>
          <div class="row"><span>Cash For Loyalty</span><span>0.00</span></div>
          <div class="row"><span>Other Cash</span><span>0.00</span></div>
          <div class="row"><span>Float Cash</span><span>${money(floatAmt)}</span></div>
          <div class="row"><span>Paid In Cash</span><span>${money(paidInTotal)}</span></div>
          <div class="row"><span>Paid Out Cash</span><span>${money(paidOutTotal)}</span></div>
          <div class="row"><span>Currency Change</span><span>0.00</span></div>
          <div class="tot"><span>Total Cash In Hand</span><span>${money(expectedCash)}</span></div>
          <div class="row"><span>Declared Cash In Hand</span><span>___________</span></div>
          <div class="row"><span>Cash Excess</span><span>___________</span></div>
          <div class="row"><span>Total Credit Cards</span><span>${money(cardSales)}</span></div>
          <div class="row"><span>Total Non Cash</span><span>0.00</span></div>
          <hr>
          <div><b>CREDIT CARD COLLECTION</b></div>
          <div class="row"><span>Master Card &nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="row"><span>Visa Card &nbsp;&nbsp; ${cardSalesCount}</span><span>${money(cardSales)}</span></div>
          <div class="tot"><span>CREDIT CARD TOTAL</span><span>${money(cardSales)}</span></div>
          <hr>
          <div><b>NON CASH COLLECTION</b></div>
          <div class="row"><span>Direct Deposit &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
          <div class="tot"><span>NON CASH TOTAL</span><span>0.00</span></div>
          <hr>
          <div><b>CURRENCY COLLECTION</b></div>
          <div class="tot"><span>TOTAL</span><span></span></div>
          <hr>
          <div><b>POS Category Sales</b></div>
          <div class="row" style="text-decoration:underline"><span>Description</span><span>Qty &nbsp;&nbsp; Net Sale</span></div>
          $` + cItemWise.map((i: any) => `<div class="row"><span>` + esc(i.item_name) + `</span><span>` + i.total_qty + ` &nbsp; ` + money(parseFloat(i.total_amount || 0)) + `</span></div>`).join('') + `
          <div class="tot"><span></span><span>${cBillCount} &nbsp; ${money(cGross)}</span></div>
          <hr>
          <div class="row"><span>Time: ${esc(new Date().toLocaleTimeString())}</span><span>No Of Bills: ${cBillCount}</span></div>
          <hr>
          <div style="margin-top:22px">Cashier: ____________________</div>
          <div style="margin-top:16px">Received By: ____________________</div>`;

        bodyHtml = `
          <div class="rep-summary-grid">
            <div class="rep-kpi"><span class="kpi-lbl">Gross Sale</span><span class="kpi-val">${money(cGross)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Net Sale</span><span class="kpi-val">${money(cNetSale)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Expected Cash</span><span class="kpi-val">${money(expectedCash)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Card Total</span><span class="kpi-val">${money(cardSales)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">Total Earns</span><span class="kpi-val">${money(cTotalEarns)}</span></div>
            <div class="rep-kpi"><span class="kpi-lbl">No. of Bills</span><span class="kpi-val">${cBillCount}</span></div>
          </div>
          <table class="rep-table">
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">SALES SUMMARY (CASHIER READING)</th></tr>
            <tr><th>Field</th><th>Count</th><th>Amount</th></tr>
            <tr><td>Gross Sale</td><td></td><td>${money(cGross)}</td></tr>
            <tr><td>Exchange</td><td>0</td><td>0.00</td></tr>
            <tr><td>Line Discount</td><td>${cDisc.line_count}</td><td>${money(cDisc.line_total)}</td></tr>
            <tr><td>Subtotal Discount</td><td>${cDisc.bill_count}</td><td>${money(cDisc.bill_total)}</td></tr>
            <tr><td><b>Net Sale</b></td><td></td><td><b>${money(cNetSale)}</b></td></tr>
            <tr><td>NBT</td><td></td><td>0.00</td></tr>
            <tr><td>VAT</td><td></td><td>0.00</td></tr>
            <tr><td><b>Sales With Tax</b></td><td></td><td><b>${money(cNetSale)}</b></td></tr>
            <tr><td>Paid In &amp; Receives</td><td></td><td>${money(paidInTotal)}</td></tr>
            <tr><td><b>Total Earns</b></td><td></td><td><b>${money(cTotalEarns)}</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">VOID / CANCEL</th></tr>
            <tr><td>Void</td><td>0</td><td>0.00</td></tr>
            <tr><td>Cancel</td><td>0</td><td>0.00</td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CASH DRAWER RECONCILIATION</th></tr>
            <tr><td>Cash Sale</td><td>${cashSalesCount}</td><td>${money(cashSales)}</td></tr>
            <tr><td>Cash Refund</td><td>0</td><td>0.00</td></tr>
            <tr><td>Cash For Voucher Sale</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Advance</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Credit Sale</td><td></td><td>0.00</td></tr>
            <tr><td>Cash For Loyalty</td><td></td><td>0.00</td></tr>
            <tr><td>Other Cash</td><td></td><td>0.00</td></tr>
            <tr><td>Float Cash</td><td></td><td>${money(floatAmt)}</td></tr>
            <tr><td>Paid In Cash</td><td></td><td>${money(paidInTotal)}</td></tr>
            <tr><td>Paid Out Cash</td><td></td><td>${money(paidOutTotal)}</td></tr>
            <tr><td>Currency Change</td><td></td><td>0.00</td></tr>
            <tr><td><b>Total Cash In Hand (Expected)</b></td><td></td><td><b>${money(expectedCash)}</b></td></tr>
            <tr><td>Declared Cash In Hand</td><td></td><td><i>___________ (Mid-Shift)</i></td></tr>
            <tr><td>Cash Excess / Short</td><td></td><td><i>___________</i></td></tr>
            <tr><td>Total Credit Cards</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
            <tr><td>Total Non Cash</td><td>0</td><td>0.00</td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CREDIT CARD COLLECTION</th></tr>
            <tr><td>Master Card</td><td>0</td><td>0.00</td></tr>
            <tr><td>Visa Card</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
            <tr><td><b>Credit Card Total</b></td><td></td><td><b>${money(cardSales)}</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">NON CASH COLLECTION</th></tr>
            <tr><td>Direct Deposit</td><td>0</td><td>0.00</td></tr>
            <tr><td><b>Non Cash Total</b></td><td></td><td><b>0.00</b></td></tr>
            <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">POS CATEGORY SALES</th></tr>
            <tr><th>Description</th><th>Qty</th><th>Net Sale</th></tr>
            $` + cItemWise.map((i: any) => `<tr><td>` + esc(i.item_name) + `</td><td>` + i.total_qty + `</td><td>` + money(parseFloat(i.total_amount || 0)) + `</td></tr>`).join('') + `
            <tr><td><b>Total</b></td><td><b>${cBillCount}</b></td><td><b>${money(cGross)}</b></td></tr>
          </table>`;
        break;
      }
      case 'discount_report': {
        const disc = repData?.discounts || { bill_count: 0, bill_total: 0, line_count: 0, line_total: 0, total: 0 };
        bodyHtml = `
          <p><b>Discount Summary Report (Shift Total)</b></p>
          <table class="rep-table">
            <tr><th>Type</th><th>Count</th><th>Discount Total</th></tr>
            <tr><td>Line Discounts</td><td>${disc.line_count}</td><td>${money(disc.line_total)}</td></tr>
            <tr><td>Bill Discounts</td><td>${disc.bill_count}</td><td>${money(disc.bill_total)}</td></tr>
            <tr><td><b>Total Discounts Given</b></td><td><b>${disc.line_count + disc.bill_count}</b></td><td><b>${money(disc.total)}</b></td></tr>
          </table>`;
        rawPrintHtml = `<h2>DISCOUNT REPORT</h2><div class="c">${esc(nowStr)}</div><hr><div class="row"><span>Line Discounts (${disc.line_count})</span><span>${money(disc.line_total)}</span></div><div class="row"><span>Bill Discounts (${disc.bill_count})</span><span>${money(disc.bill_total)}</span></div><div class="tot"><span>TOTAL DISCOUNTS</span><span>${money(disc.total)}</span></div>`;
        break;
      }
      case 'suspend_report':
      case 'pending_suspend_report': {
        const serverBills: any[] = repData?.suspended || [];
        const localBills = this.readLocalBills();
        const allBills = [...serverBills, ...localBills.filter(lb => !serverBills.some(sb => sb.suspend_no === lb.suspend_no))];
        const rows = allBills.map(b => `<tr><td>${esc(b.suspend_no)}</td><td>${esc(b.cashier)}</td><td>${b.items_count || b.items?.length || 0} items</td><td>${money(b.total)}</td></tr>`).join('');
        bodyHtml = `<p><b>Suspended / Held Bills (${allBills.length})</b></p><table class="rep-table"><tr><th>Suspend No</th><th>Cashier</th><th>Items</th><th>Total</th></tr>${rows || '<tr><td colspan="4" style="text-align:center">No suspended bills</td></tr>'}</table>`;
        rawPrintHtml = `<h2>SUSPEND REPORT</h2><div class="c">Open Bills: ${allBills.length}</div><hr>` + allBills.map(b => `<div class="row"><span>${esc(b.suspend_no)}</span><span>${money(b.total)}</span></div>`).join('');
        break;
      }
      case 'paid_out_report': {
        const list: any[] = repData?.paid_out || [];
        const rows = list.map(p => `<tr><td>${esc(new Date(p.created_at).toLocaleTimeString())}</td><td>${esc(p.reason || 'Paid Out')}</td><td>${money(p.amount)}</td></tr>`).join('');
        bodyHtml = `<p><b>Paid Out Disbursements (${list.length})</b></p><table class="rep-table"><tr><th>Time</th><th>Reason</th><th>Amount</th></tr>${rows || '<tr><td colspan="3" style="text-align:center">No paid out transactions today</td></tr>'}<tr><td><b>Total Paid Out</b></td><td></td><td><b>${money(paidOutTotal)}</b></td></tr></table>`;
        rawPrintHtml = `<h2>PAID OUT REPORT</h2><div class="c">${esc(nowStr)}</div><hr>` + list.map(p => `<div class="row"><span>${esc(p.reason)}</span><span>${money(p.amount)}</span></div>`).join('') + `<hr><div class="tot"><span>TOTAL PAID OUT</span><span>${money(paidOutTotal)}</span></div>`;
        break;
      }
      case 'paid_in_report': {
        const list: any[] = repData?.paid_in || [];
        const rows = list.map(p => `<tr><td>${esc(new Date(p.created_at).toLocaleTimeString())}</td><td>${esc(p.reason || 'Paid In / Float Add')}</td><td>${money(p.amount)}</td></tr>`).join('');
        bodyHtml = `<p><b>Paid In Register Collections (${list.length})</b></p><table class="rep-table"><tr><th>Time</th><th>Reason</th><th>Amount</th></tr>${rows || '<tr><td colspan="3" style="text-align:center">No paid in transactions today</td></tr>'}<tr><td><b>Total Paid In</b></td><td></td><td><b>${money(paidInTotal)}</b></td></tr></table>`;
        rawPrintHtml = `<h2>PAID IN REPORT</h2><div class="c">${esc(nowStr)}</div><hr>` + list.map(p => `<div class="row"><span>${esc(p.reason)}</span><span>${money(p.amount)}</span></div>`).join('') + `<hr><div class="tot"><span>TOTAL PAID IN</span><span>${money(paidInTotal)}</span></div>`;
        break;
      }
      case 'bill_cancel_report': {
        bodyHtml = `<p><b>Bill Cancel & Void Report</b></p><table class="rep-table"><tr><th>Invoice No</th><th>Reason</th><th>Void Amount</th></tr><tr><td colspan="3" style="text-align:center">No cancelled bills today</td></tr></table>`;
        rawPrintHtml = `<h2>BILL CANCEL REPORT</h2><div class="c">${esc(nowStr)}</div><hr><div class="row"><span>Total Voided</span><span>${money(0)}</span></div>`;
        break;
      }
      case 'item_wise_report': {
        const items: any[] = repData?.item_wise || [];
        const rows = items.map(i => `<tr><td>${esc(i.item_code)}</td><td>${esc(i.item_name)}</td><td>${i.total_qty}</td><td>${money(i.total_amount)}</td></tr>`).join('');
        const itemSum = items.reduce((s, i) => s + parseFloat(i.total_amount || 0), 0);
        bodyHtml = `<p><b>Item-Wise Sales Summary (${items.length} items)</b></p><table class="rep-table"><tr><th>Code</th><th>Item Name</th><th>Qty</th><th>Sales Total</th></tr>${rows || '<tr><td colspan="4" style="text-align:center">No item sales records found for shift</td></tr>'}<tr><td><b>Shift Item Total</b></td><td></td><td></td><td><b>${money(itemSum)}</b></td></tr></table>`;
        rawPrintHtml = `<h2>ITEM WISE SALE REPORT</h2><div class="c">${esc(nowStr)}</div><hr>` + items.map(i => `<div class="row"><span>${esc(i.item_name)} (${i.total_qty})</span><span>${money(i.total_amount)}</span></div>`).join('') + `<hr><div class="tot"><span>TOTAL ITEMS</span><span>${money(itemSum)}</span></div>`;
        break;
      }
      case 'card_usage_report': {
        const cs = repData?.card_sales || { count: cardSalesCount, amount: cardSales };
        bodyHtml = `<p><b>Credit/Debit Card Sales Report</b></p><table class="rep-table"><tr><th>Terminal</th><th>Count</th><th>Total Card Amount</th></tr><tr><td>${esc(this.terminal)}</td><td>${cs.count}</td><td>${money(cs.amount)}</td></tr></table>`;
        rawPrintHtml = `<h2>CREDIT CARD USAGE REPORT</h2><div class="c">${esc(nowStr)}</div><hr><div class="row"><span>Cards Processed (${cs.count})</span><span>${money(cs.amount)}</span></div>`;
        break;
      }
      case 'salesman_wise_report': {
        bodyHtml = `<p><b>Salesman Performance Summary</b></p><table class="rep-table"><tr><th>Cashier / Salesman</th><th>Bills</th><th>Total Sales</th></tr><tr><td>${esc(this.cashier || 'Cashier')}</td><td>${cashSalesCount + cardSalesCount}</td><td>${money(totalNetSales)}</td></tr></table>`;
        rawPrintHtml = `<h2>SALESMAN SALES REPORT</h2><div class="c">${esc(nowStr)}</div><hr><div class="row"><span>${esc(this.cashier || 'Cashier')}</span><span>${money(totalNetSales)}</span></div>`;
        break;
      }
      case 'credit_note_report': {
        bodyHtml = `<p><b>Credit Notes & Vouchers Report</b></p><table class="rep-table"><tr><th>Note No</th><th>Issued / Redeemed</th><th>Amount</th></tr><tr><td colspan="3" style="text-align:center">No credit notes processed today</td></tr></table>`;
        rawPrintHtml = `<h2>CREDIT NOTE REPORT</h2><div class="c">${esc(nowStr)}</div><hr><div class="row"><span>Total Notes</span><span>${money(0)}</span></div>`;
        break;
      }
      case 'currency_details_report': {
        const denomRows = this.denominations.filter(d => (d.count || 0) > 0).map(d => `<tr><td>Rs ${d.label}</td><td>${d.count}</td><td>${money(d.value * (d.count || 0))}</td></tr>`).join('');
        const calcTotal = this.calcDenomTotal();
        bodyHtml = `<p><b>Cash Denomination Details</b></p><table class="rep-table"><tr><th>Denomination</th><th>Count</th><th>Subtotal</th></tr>${denomRows || '<tr><td colspan="3" style="text-align:center">No denomination counts entered</td></tr>'}<tr><td><b>Total Calculated</b></td><td></td><td><b>${money(calcTotal)}</b></td></tr></table>`;
        rawPrintHtml = `<h2>CURRENCY DETAILS REPORT</h2><div class="c">${esc(nowStr)}</div><hr>` + (denomRows ? this.denominations.filter(d => (d.count || 0) > 0).map(d => `<div class="row"><span>Rs ${d.label} x ${d.count}</span><span>${money(d.value * (d.count || 0))}</span></div>`).join('') : '<div class="c">No counts entered</div>') + `<hr><div class="tot"><span>TOTAL DENOMS</span><span>${money(calcTotal)}</span></div>`;
        break;
      }
      case 'exit_system': {
        if (confirm('Are you sure you want to log out / exit system?')) {
          this.authService.logout();
          window.location.href = '/auth/login';
        }
        return;
      }
      case 'shutdown_terminal': {
        if (confirm('Do you want to close cash shift and shut down terminal session?')) {
          this.closeCashierReports();
          this.openCloseCash();
        }
        return;
      }
      case 'exit_menu': {
        this.closeCashierReports();
        return;
      }
      default:
        bodyHtml = `<p>${esc(report.description)}</p>`;
        rawPrintHtml = `<h2>${esc(report.title)}</h2><div class="c">${esc(nowStr)}</div>`;
        break;
    }

    if (mode === 'print') {
      this.printSlip(report.title, rawPrintHtml || bodyHtml);
    } else {
      this.activeReportDetail = {
        title: report.title,
        subtitle: `Terminal ${this.terminal} • ${nowStr}`,
        contentHtml: bodyHtml,
        rawBody: rawPrintHtml
      };
      this.showReportDetailModal = true;
    }
  }

  // ---------- Float Cash / Close Cash ----------

  loadCashStatus(): void {
    this.apiGet<any>('cash_status', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.cashSession = res.data ? this.toCashSummary(res.data) : null;
          if (res.next_invoice_no) {
            this.currentInvoiceNo = res.next_invoice_no;
          }
          if (res.salesmen && res.salesmen.length > 0) {
            this.salesmenList = res.salesmen;
          }
          if (res.location && !res.location.includes('Mawathagama')) {
            this.location = res.location;
          }
          if (res.user) {
            this.applyUserData(res.user);
          }
        }
      },
      error: (err) => console.warn('cash_status API unavailable', err)
    });
  }

  private toCashSummary(d: any): CashSummary {
    const num = (v: any) => parseFloat(v) || 0;
    return {
      ...d,
      opened_at: this.utcToIso(d.opened_at),
      closed_at: d.closed_at ? this.utcToIso(d.closed_at) : undefined,
      opening_float: num(d.opening_float),
      cash_sales_count: parseInt(d.cash_sales_count) || 0,
      cash_sales_total: num(d.cash_sales_total),
      card_sales_count: parseInt(d.card_sales_count) || 0,
      card_sales_total: num(d.card_sales_total),
      paid_in_total: num(d.paid_in_total),
      paid_out_total: num(d.paid_out_total),
      expected_cash: num(d.expected_cash),
      counted_cash: d.counted_cash !== undefined && d.counted_cash !== null ? num(d.counted_cash) : undefined,
      difference: d.difference !== undefined && d.difference !== null ? num(d.difference) : undefined,
      z_reading_no: d.z_reading_no ? parseInt(d.z_reading_no) : undefined,
      last_invoice_no: d.last_invoice_no || undefined,
      next_invoice_no: d.next_invoice_no || undefined
    };
  }

  // A number typed in the scan field is used as the amount
  openFloat(): void {
    const typed = this.searchText.trim();
    this.floatActionType = this.cashSession ? 'open' : 'open';
    this.floatReason = '';
    this.floatInput = /^\d+(\.\d{1,2})?$/.test(typed)
      ? typed
      : (this.cashSession ? String(this.cashSession.opening_float) : '');
    if (this.floatInput === typed) this.searchText = '';
    this.cashError = '';
    this.showFloat = true;
    this.clearDenominations();
  }

  onDenomCountChange(mode: 'float' | 'close'): void {
    const total = this.calcDenomTotal();
    const formatted = total > 0 ? String(this.round2(total)) : '';
    if (mode === 'float') {
      this.floatInput = formatted;
    } else {
      this.countedInput = formatted;
    }
  }

  clearDenominations(mode?: 'float' | 'close'): void {
    this.denominations.forEach(d => d.count = null);
    if (mode === 'float') {
      this.floatInput = '';
    } else if (mode === 'close') {
      this.countedInput = '';
    }
  }

  calcDenomTotal(): number {
    return this.round2(
      this.denominations.reduce((sum, item) => {
        const count = item.count && item.count > 0 ? Number(item.count) : 0;
        return sum + (item.value * count);
      }, 0)
    );
  }

  saveFloat(): void {
    const amount = parseFloat(this.floatInput);
    if (isNaN(amount) || amount < 0) {
      this.cashError = 'Enter the float amount, 0 or more.';
      return;
    }
    this.cashBusy = true;
    this.cashError = '';
    const isAddition = !!this.cashSession && this.floatActionType === 'add';
    const payload = {
      terminal: this.terminal,
      cashier: this.cashier,
      amount: this.round2(amount),
      is_addition: isAddition,
      reason: this.floatReason || (isAddition ? 'Additional Float Added' : 'Opening Float')
    };

    this.apiPost<any>('open_float', payload).subscribe({
      next: (res) => {
        this.cashBusy = false;
        if (res && res.status === 'success') {
          this.cashSession = this.toCashSummary(res.data);
          this.showFloat = false;
        } else {
          this.cashError = res?.message || 'Float was not saved.';
        }
      },
      error: (err) => {
        this.cashBusy = false;
        console.warn('open_float API failed', err);
        this.cashError = 'Could not reach the server. Float was not saved.';
      }
    });
  }

  // ---------- Paid In / Paid Out Actions ----------

  openPaidIn(): void {
    if (!this.cashSession) {
      alert('Please enter Float Cash to open a shift before recording Paid In.');
      return;
    }
    this.paidMode = 'paid_in';
    this.paidAmountInput = '';
    this.paidReasonInput = 'Change Top-Up';
    this.paidError = '';
    this.showPaidModal = true;
  }

  openPaidOut(): void {
    if (!this.cashSession) {
      alert('Please enter Float Cash to open a shift before recording Paid Out.');
      return;
    }
    this.paidMode = 'paid_out';
    this.paidAmountInput = '';
    this.paidReasonInput = 'Petty Cash';
    this.paidError = '';
    this.showPaidModal = true;
  }

  closePaidModal(): void {
    this.showPaidModal = false;
  }

  confirmPaidTransaction(): void {
    const amount = parseFloat(this.paidAmountInput);
    if (isNaN(amount) || amount <= 0) {
      this.paidError = 'Please enter a valid amount greater than 0.';
      return;
    }
    if (!this.paidReasonInput.trim()) {
      this.paidError = 'Please enter or select a reason for this cash transaction.';
      return;
    }
    this.paidBusy = true;
    this.paidError = '';
    this.apiPost<any>('cash_transaction', {
      terminal: this.terminal,
      cashier: this.cashier,
      type: this.paidMode,
      amount: this.round2(amount),
      reason: this.paidReasonInput.trim()
    }).subscribe({
      next: (res) => {
        this.paidBusy = false;
        if (res?.status === 'success' && res.data) {
          this.cashSession = this.toCashSummary(res.data);
          this.showPaidModal = false;
          alert(`${this.paidMode === 'paid_in' ? 'Paid In' : 'Paid Out'} of Rs ${this.money(amount)} saved.`);
        } else {
          this.paidError = res?.message || 'Could not record cash transaction.';
        }
      },
      error: (err) => {
        this.paidBusy = false;
        console.warn('cash_transaction API failed', err);
        this.paidError = 'Could not reach server to record cash transaction.';
      }
    });
  }

  openCloseCash(): void {
    if (Object.keys(this.cart).length > 0) {
      alert('Finish, suspend or cancel the current bill before closing cash.');
      return;
    }
    // Fresh figures from the server, so sales from moments ago are included
    this.apiGet<any>('cash_status', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data) {
          this.cashSession = this.toCashSummary(res.data);
          this.countedInput = '';
          this.cashError = '';
          this.showClose = true;
          this.clearDenominations();
        } else if (res && res.status === 'success') {
          this.cashSession = null;
          alert('No float entered on this terminal. Click Float Cash first.');
        } else {
          alert(res?.message || 'Could not load cash in hand.');
        }
      },
      error: (err) => {
        console.warn('cash_status API failed', err);
        alert('Could not reach the server to load cash in hand.');
      }
    });
  }

  // Counted minus expected: positive is over, negative is short
  cashDifference(): number | null {
    const counted = parseFloat(this.countedInput);
    if (isNaN(counted) || !this.cashSession) return null;
    return this.round2(counted - this.cashSession.expected_cash);
  }

  promptDrawerCheckForCashierReading(mode: 'view' | 'print'): void {
    this.drawerCountReportMode = 'cashier_reading';
    this.drawerCountAction = mode;
    this.apiGet<any>('cash_status', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data) {
          this.cashSession = this.toCashSummary(res.data);
          this.countedInput = '';
          this.cashError = '';
          this.showClose = true;
          this.clearDenominations('close');
        } else {
          alert('No active cash shift found on terminal ' + this.terminal + '. Enter Float Cash first.');
        }
      },
      error: (err) => {
        console.warn('cash_status API failed', err);
        alert('Could not verify cash drawer status for Cashier Reading.');
      }
    });
  }

  promptDrawerCollectionForZReading(mode: 'view' | 'print'): void {
    if (Object.keys(this.cart).length > 0) {
      alert('Finish, suspend or cancel the current bill before entering drawer cash and generating Z-Reading.');
      return;
    }
    this.zReadingRequestedMode = mode;
    this.drawerCountReportMode = 'z_reading';
    this.drawerCountAction = mode;
    this.apiGet<any>('cash_status', { terminal: this.terminal }).subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data) {
          this.cashSession = this.toCashSummary(res.data);
          this.countedInput = '';
          this.cashError = '';
          this.showClose = true;
          this.clearDenominations('close');
        } else {
          alert('No active cash shift found on terminal ' + this.terminal + '. Enter Float Cash first.');
        }
      },
      error: (err) => {
        console.warn('cash_status API failed', err);
        alert('Could not check cash status for Z-Reading.');
      }
    });
  }

  confirmCloseCash(): void {
    const counted = parseFloat(this.countedInput);
    if (isNaN(counted) || counted < 0) {
      this.cashError = 'Count the cash in the drawer and enter the amount.';
      return;
    }

    if (this.drawerCountReportMode === 'cashier_reading') {
      // TEMPORARY AUDIT CHECK: DO NOT CLOSE SHIFT IN DATABASE!
      this.tempAuditCountedCash = this.round2(counted);
      const action = this.drawerCountAction || 'print';
      this.showClose = false;
      this.drawerCountReportMode = null;

      // Reload fresh cashier reports data so figures are up to date
      this.apiGet<any>('cashier_reports_data', { terminal: this.terminal }).subscribe({
        next: (repRes) => {
          if (repRes?.status === 'success' && repRes.data) {
            this.cashierReportsData = repRes.data;
          }
          this.renderCashierReadingDirect(action, counted);
        },
        error: () => {
          this.renderCashierReadingDirect(action, counted);
        }
      });
      return;
    }

    // Day End Z-Reading or Close Cash: Permanently close shift in database
    this.cashBusy = true;
    this.apiPost<any>('close_cash', { terminal: this.terminal, counted: this.round2(counted) }).subscribe({
      next: (res) => {
        this.cashBusy = false;
        if (res && res.status === 'success') {
          const closed = this.toCashSummary(res.data);
          closed.counted_cash = parseFloat(res.data.counted_cash) || 0;
          closed.difference = parseFloat(res.data.difference) || 0;
          if (res.data?.z_reading_no) closed.z_reading_no = res.data.z_reading_no;
          if (res.data?.last_invoice_no) closed.last_invoice_no = res.data.last_invoice_no;

          // WHEN GET Z READING: INVOICE NUMBER RESETS BACK TO #1!
          this.currentInvoiceNo = res.reset_invoice_no || res.next_invoice_no || ('INMW' + this.getTerminalDigit() + '0000001');

          this.lastClosedSession = closed;
          this.cashSession = closed;
          this.showClose = false;

          const requestedMode = this.drawerCountAction || this.zReadingRequestedMode || 'print';
          this.zReadingRequestedMode = null;
          this.drawerCountReportMode = null;

          // Reload fresh cashier reports data
          this.apiGet<any>('cashier_reports_data', { terminal: this.terminal }).subscribe({
            next: (repRes) => {
              if (repRes?.status === 'success' && repRes.data) {
                this.cashierReportsData = repRes.data;
                if (repRes.data.session) {
                  this.cashSession = this.toCashSummary(repRes.data.session);
                }
              }
              const zReport = this.cashierReportsList.find(r => r.id === 'z_reading') || { id: 'z_reading', title: 'Z Reading (Day End Report)', description: '' };
              this.executeReportAction(zReport, requestedMode);
            },
            error: () => {
              const zReport = this.cashierReportsList.find(r => r.id === 'z_reading') || { id: 'z_reading', title: 'Z Reading (Day End Report)', description: '' };
              this.executeReportAction(zReport, requestedMode);
            }
          });
        } else {
          this.cashError = res?.message || 'Close cash failed.';
        }
      },
      error: (err) => {
        this.cashBusy = false;
        console.warn('close_cash API failed', err);
        this.cashError = 'Could not reach the server. Cash was not closed.';
      }
    });
  }

  renderCashierReadingDirect(mode: 'view' | 'print', auditCountedCash: number): void {
    const esc = this.esc;
    const money = this.money;
    const nowStr = new Date().toLocaleString();
    const session = this.cashSession;
    const floatAmt = session ? session.opening_float : 0;
    const cashSales = session ? session.cash_sales_total : 0;
    const cashSalesCount = session ? session.cash_sales_count : 0;
    const cardSales = session ? (session.card_sales_total || 0) : 0;
    const cardSalesCount = session ? (session.card_sales_count || 0) : 0;
    const paidInTotal = session ? (session.paid_in_total || 0) : 0;
    const paidOutTotal = session ? (session.paid_out_total || 0) : 0;
    const expectedCash = session ? session.expected_cash : floatAmt + cashSales + paidInTotal - paidOutTotal;

    const repData = this.cashierReportsData;
    const cDisc = repData?.discounts || { bill_count: 0, bill_total: 0, line_count: 0, line_total: 0, total: 0 };
    const cGross = this.round2(cashSales + cardSales);
    const cNetSale = this.round2(cGross - (cDisc.total || 0));
    const cTotalEarns = this.round2(cNetSale + paidInTotal);
    const cItemWise: any[] = repData?.item_wise || [];
    const cBillCount = cashSalesCount + cardSalesCount;
    const cNum = session?.session_id ? ('CR' + String(session.session_id).padStart(6, '0')) : 'CR000001';

    const declaredCash = auditCountedCash;
    const diff = this.round2(declaredCash - expectedCash);

    let diffLabel = 'Cash Short / Excess';
    let diffReceiptLabel = 'Cash Excess';
    let diffValStr = '0.00';
    let diffColor = '#003366';

    if (diff < 0) {
      diffLabel = 'Cash Shortage';
      diffReceiptLabel = 'Cash Shortage';
      diffValStr = '-' + money(Math.abs(diff));
      diffColor = '#c62828';
    } else if (diff > 0) {
      diffLabel = 'Cash Excess';
      diffReceiptLabel = 'Cash Excess';
      diffValStr = '+' + money(diff);
      diffColor = '#2e7d32';
    } else {
      diffLabel = 'Cash Balanced';
      diffReceiptLabel = 'Cash Short / Excess';
      diffValStr = '0.00 (Balanced)';
      diffColor = '#1565c0';
    }

    const rawPrintHtml = `
      <h2>CASHIER READING</h2>
      <div class="c">${esc(this.location)}</div>
      <div class="c" style="font-size:11px;color:#555">*** MID-SHIFT AUDIT (SHIFT REMAINS OPEN) ***</div>
      <hr>
      <div class="row"><span>Terminal: ${esc(this.terminal)}</span><span>Ref # ${esc(cNum)}</span></div>
      <div class="row"><span>Cashier: ${esc(this.cashier)}</span><span>Date: ${esc(new Date().toLocaleDateString())}</span></div>
      <hr>
      <div class="row"><span>Gross Sale</span><span>${money(cGross)}</span></div>
      <div class="row"><span>Exchange &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
      <div class="row"><span>Line Discount &nbsp;&nbsp;&nbsp; ${cDisc.line_count}</span><span>${money(cDisc.line_total)}</span></div>
      <div class="row"><span>Subtotal Discount &nbsp;&nbsp;&nbsp; ${cDisc.bill_count}</span><span>${money(cDisc.bill_total)}</span></div>
      <div class="tot"><span>Net Sale</span><span>${money(cNetSale)}</span></div>
      <div class="row"><span>Nbt</span><span>0.00</span></div>
      <div class="row"><span>Vat</span><span>0.00</span></div>
      <div class="tot"><span>Sales With Tax</span><span>${money(cNetSale)}</span></div>
      <div class="row"><span>Gift Voucher Sale &nbsp;&nbsp;&nbsp; 0.00</span><span>0.00</span></div>
      <div class="row"><span>Loyalty Card Issue</span><span>0.00</span></div>
      <div class="row"><span>Collection For Credit</span><span>0.00</span></div>
      <div class="row"><span>Advance Receive</span><span>0.00</span></div>
      <div class="row"><span>Paid In &amp; Receives</span><span>${money(paidInTotal)}</span></div>
      <div class="tot"><span>Total Earns</span><span>${money(cTotalEarns)}</span></div>
      <hr>
      <div class="row"><span>Void &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
      <div class="row"><span>Cancel &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
      <hr>
      <div class="row"><span>Cash Sale</span><span>${money(cashSales)}</span></div>
      <div class="row"><span>Cash Refund &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
      <div class="row"><span>Cash For Voucher Sale</span><span>0.00</span></div>
      <div class="row"><span>Cash For Advance</span><span>0.00</span></div>
      <div class="row"><span>Cash For Credit Sale</span><span>0.00</span></div>
      <div class="row"><span>Cash For Loyalty</span><span>0.00</span></div>
      <div class="row"><span>Other Cash</span><span>0.00</span></div>
      <div class="row"><span>Float Cash</span><span>${money(floatAmt)}</span></div>
      <div class="row"><span>Paid In Cash</span><span>${money(paidInTotal)}</span></div>
      <div class="row"><span>Paid Out Cash</span><span>${money(paidOutTotal)}</span></div>
      <div class="row"><span>Currency Change</span><span>0.00</span></div>
      <div class="tot"><span>Total Cash In Hand (Expected)</span><span>${money(expectedCash)}</span></div>
      <div class="row"><span>Declared Cash In Hand (Counted)</span><span>${money(declaredCash)}</span></div>
      <div class="row" style="font-weight:bold"><span>${esc(diffReceiptLabel)}</span><span>${diffValStr}</span></div>
      <div class="row"><span>Total Credit Cards</span><span>${money(cardSales)}</span></div>
      <div class="row"><span>Total Non Cash</span><span>0.00</span></div>
      <hr>
      <div><b>CREDIT CARD COLLECTION</b></div>
      <div class="row"><span>Master Card &nbsp;&nbsp; 0</span><span>0.00</span></div>
      <div class="row"><span>Visa Card &nbsp;&nbsp; ${cardSalesCount}</span><span>${money(cardSales)}</span></div>
      <div class="tot"><span>CREDIT CARD TOTAL</span><span>${money(cardSales)}</span></div>
      <hr>
      <div><b>NON CASH COLLECTION</b></div>
      <div class="row"><span>Direct Deposit &nbsp;&nbsp;&nbsp; 0</span><span>0.00</span></div>
      <div class="tot"><span>NON CASH TOTAL</span><span>0.00</span></div>
      <hr>
      <div><b>CURRENCY COLLECTION</b></div>
      <div class="tot"><span>TOTAL</span><span></span></div>
      <hr>
      <div><b>POS Category Sales</b></div>
      <div class="row" style="text-decoration:underline"><span>Description</span><span>Qty &nbsp;&nbsp; Net Sale</span></div>
      $` + cItemWise.map((i: any) => `<div class="row"><span>` + esc(i.item_name) + `</span><span>` + i.total_qty + ` &nbsp; ` + money(parseFloat(i.total_amount || 0)) + `</span></div>`).join('') + `
      <div class="tot"><span></span><span>${cBillCount} &nbsp; ${money(cGross)}</span></div>
      <hr>
      <div class="row"><span>Time: ${esc(new Date().toLocaleTimeString())}</span><span>No Of Bills: ${cBillCount}</span></div>
      <hr>
      <div style="margin-top:22px">Cashier: ____________________</div>
      <div style="margin-top:16px">Received By: ____________________</div>`;

    const bodyHtml = `
      <div style="background:#fef3c7;border:1px solid #f59e0b;color:#92400e;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-size:13px;display:flex;align-items:center;gap:8px">
        <span>⚠️</span>
        <span><b>Mid-Shift Audit Check:</b> Counted drawer cash was verified. Cash shift remains <b>ACTIVE &amp; OPEN</b>.</span>
      </div>
      <div class="rep-summary-grid">
        <div class="rep-kpi"><span class="kpi-lbl">Gross Sale</span><span class="kpi-val">${money(cGross)}</span></div>
        <div class="rep-kpi"><span class="kpi-lbl">Net Sale</span><span class="kpi-val">${money(cNetSale)}</span></div>
        <div class="rep-kpi"><span class="kpi-lbl">Expected Cash</span><span class="kpi-val">${money(expectedCash)}</span></div>
        <div class="rep-kpi"><span class="kpi-lbl">Counted Drawer Cash</span><span class="kpi-val">${money(declaredCash)}</span></div>
        <div class="rep-kpi" style="border-left:4px solid ${diffColor}"><span class="kpi-lbl">${diffLabel}</span><span class="kpi-val" style="color:${diffColor}">${diffValStr}</span></div>
        <div class="rep-kpi"><span class="kpi-lbl">No. of Bills</span><span class="kpi-val">${cBillCount}</span></div>
      </div>
      <table class="rep-table">
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">SALES SUMMARY (CASHIER READING AUDIT)</th></tr>
        <tr><th>Field</th><th>Count</th><th>Amount</th></tr>
        <tr><td>Gross Sale</td><td></td><td>${money(cGross)}</td></tr>
        <tr><td>Exchange</td><td>0</td><td>0.00</td></tr>
        <tr><td>Line Discount</td><td>${cDisc.line_count}</td><td>${money(cDisc.line_total)}</td></tr>
        <tr><td>Subtotal Discount</td><td>${cDisc.bill_count}</td><td>${money(cDisc.bill_total)}</td></tr>
        <tr><td><b>Net Sale</b></td><td></td><td><b>${money(cNetSale)}</b></td></tr>
        <tr><td>NBT</td><td></td><td>0.00</td></tr>
        <tr><td>VAT</td><td></td><td>0.00</td></tr>
        <tr><td><b>Sales With Tax</b></td><td></td><td><b>${money(cNetSale)}</b></td></tr>
        <tr><td>Paid In &amp; Receives</td><td></td><td>${money(paidInTotal)}</td></tr>
        <tr><td><b>Total Earns</b></td><td></td><td><b>${money(cTotalEarns)}</b></td></tr>
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">VOID / CANCEL</th></tr>
        <tr><td>Void</td><td>0</td><td>0.00</td></tr>
        <tr><td>Cancel</td><td>0</td><td>0.00</td></tr>
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CASH RECONCILIATION AUDIT</th></tr>
        <tr><td>Cash Sale</td><td>${cashSalesCount}</td><td>${money(cashSales)}</td></tr>
        <tr><td>Cash Refund</td><td>0</td><td>0.00</td></tr>
        <tr><td>Float Cash</td><td></td><td>${money(floatAmt)}</td></tr>
        <tr><td>Paid In Cash</td><td></td><td>${money(paidInTotal)}</td></tr>
        <tr><td>Paid Out Cash</td><td></td><td>${money(paidOutTotal)}</td></tr>
        <tr><td><b>Total Cash In Hand (Expected)</b></td><td></td><td><b>${money(expectedCash)}</b></td></tr>
        <tr><td><b>Declared Cash In Hand (Counted)</b></td><td></td><td><b>${money(declaredCash)}</b></td></tr>
        <tr style="background:${diff < 0 ? '#ffebee' : diff > 0 ? '#e8f5e9' : '#f0fdf4'}">
          <td><b style="color:${diffColor}">${diffLabel}</b></td>
          <td></td>
          <td><b style="color:${diffColor};font-size:15px">${diffValStr}</b></td>
        </tr>
        <tr><td>Total Credit Cards</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
        <tr><td>Total Non Cash</td><td>0</td><td>0.00</td></tr>
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">CREDIT CARD COLLECTION</th></tr>
        <tr><td>Master Card</td><td>0</td><td>0.00</td></tr>
        <tr><td>Visa Card</td><td>${cardSalesCount}</td><td>${money(cardSales)}</td></tr>
        <tr><td><b>Credit Card Total</b></td><td></td><td><b>${money(cardSales)}</b></td></tr>
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">NON CASH COLLECTION</th></tr>
        <tr><td>Direct Deposit</td><td>0</td><td>0.00</td></tr>
        <tr><td><b>Non Cash Total</b></td><td></td><td><b>0.00</b></td></tr>
        <tr><th colspan="3" style="background:#003366;color:#fff;text-align:center">POS CATEGORY SALES</th></tr>
        <tr><th>Description</th><th>Qty</th><th>Net Sale</th></tr>
        $` + cItemWise.map((i: any) => `<tr><td>` + esc(i.item_name) + `</td><td>` + i.total_qty + `</td><td>` + money(parseFloat(i.total_amount || 0)) + `</td></tr>`).join('') + `
        <tr><td><b>Total</b></td><td><b>${cBillCount}</b></td><td><b>${money(cGross)}</b></td></tr>
      </table>`;

    if (mode === 'print') {
      this.printSlip('Cashier Reading Audit', rawPrintHtml);
    } else {
      this.activeReportDetail = {
        title: 'Cashier Reading (Mid-Shift Audit)',
        subtitle: `Terminal ${this.terminal} • Shift Open • Verified at ${nowStr}`,
        contentHtml: bodyHtml,
        rawBody: rawPrintHtml
      };
      this.showReportDetailModal = true;
    }
  }

  closeCashModals(): void {
    this.showFloat = false;
    this.showClose = false;
    this.zReadingRequestedMode = null;
    this.drawerCountReportMode = null;
  }

  printCloseSlip(s: CashSummary): void {
    const esc = this.esc;
    const money = this.money;
    const diff = s.difference || 0;
    const diffText = diff === 0 ? 'BALANCED' : diff > 0 ? 'OVER' : 'SHORT';
    this.printSlip(`Close cash ${s.terminal}`, `
      <h2>CLOSE CASH</h2>
      <div class="c">${esc(this.location)}</div>
      <hr>
      <div>Terminal: ${esc(s.terminal)} &nbsp; Cashier: ${esc(s.cashier)}</div>
      <div>Opened: ${esc(new Date(s.opened_at).toLocaleString())}</div>
      <div>Closed: ${esc(new Date(s.closed_at || Date.now()).toLocaleString())}</div>
      <hr>
      <div class="row"><span>Opening float</span><span>${money(s.opening_float)}</span></div>
      <div class="row"><span>Cash sales (${s.cash_sales_count})</span><span>${money(s.cash_sales_total)}</span></div>
      <div class="tot"><span>CASH IN HAND</span><span>${money(s.expected_cash)}</span></div>
      <div class="row"><span>Counted cash</span><span>${money(s.counted_cash || 0)}</span></div>
      <div class="row"><span>Difference ${diffText}</span><span>${diff > 0 ? '+' : ''}${money(diff)}</span></div>
      <hr>
      <div style="margin-top:24px">Cashier sign: ____________________</div>
      <div style="margin-top:18px">Checked by: ____________________</div>`);
  }

  // ---------- Copy Line: reprint a completed bill ----------

  // Scan field empty: last bill. Bill number: that bill. YYYY.MM.DD.number: that bill on that day.
  copyLine(): void {
    const ref = this.searchText.trim().toUpperCase();
    const localSales = this.readLocal<SaleRecord>(LOCAL_SALES_KEY);

    if (ref) {
      const local = localSales.find(s => s.invoice_no === ref);
      if (local) {
        this.searchText = '';
        this.printBillCopy(local);
        return;
      }
    }

    const params: { [key: string]: string } = ref
      ? { ref, tz: String(new Date().getTimezoneOffset()) }
      : { last: '1' };

    this.apiGet<any>('get_sale', params).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.searchText = '';
          this.printBillCopy(this.toSaleRecord(res.data));
        } else if (!ref && localSales.length > 0) {
          this.printBillCopy(localSales[0]);
        } else {
          alert(res?.message || 'Bill not found');
        }
      },
      error: (err) => {
        console.warn('get_sale API failed', err);
        if (!ref && localSales.length > 0) {
          this.printBillCopy(localSales[0]);
        } else {
          alert('Could not reach the server to find the bill. Try again.');
        }
      }
    });
  }

  private toSaleRecord(d: any): SaleRecord {
    const num = (v: any) => parseFloat(v) || 0;
    return {
      invoice_no: d.invoice_no,
      created_at: this.utcToIso(d.created_at),
      cashier: d.cashier,
      payment_method: d.payment_method,
      subtotal: num(d.subtotal),
      discount: num(d.discount),
      discount_label: d.discount_label,
      total: num(d.total),
      tendered: num(d.tendered),
      items: (d.items || []).map((l: any) => ({
        code: l.code, name: l.name, qty: num(l.qty), price: num(l.price),
        discount: num(l.discount), discount_label: l.discount_label, total: num(l.total)
      }))
    };
  }

  printBillCopy(sale: SaleRecord): void {
    const esc = this.esc;
    const money = this.money;
    const lines = sale.items.map(l => `
      <div class="item">${esc(l.name)}</div>
      <div class="row"><span>${l.qty} x ${money(l.price)}</span><span>${money(l.qty * l.price)}</span></div>` +
      (l.discount > 0 ? `<div class="row"><span>Discount ${esc(l.discount_label || '')}</span><span>-${money(l.discount)}</span></div>` : '')
    ).join('');
    const billDisc = sale.discount > 0 ? `
      <div class="row"><span>Discount ${esc(sale.discount_label || '')}</span><span>-${money(sale.discount)}</span></div>` : '';

    this.printSlip(`${sale.invoice_no} COPY`, `
      <h2>*** COPY ***</h2>
      <div class="c">${esc(this.location)}</div>
      <hr>
      <div>Bill No: ${esc(sale.invoice_no)}</div>
      <div>Date: ${esc(new Date(sale.created_at).toLocaleString())}</div>
      <div>Cashier: ${esc(sale.cashier)}</div>
      <div>Reprinted: ${esc(new Date().toLocaleString())}</div>
      <hr>
      ${lines}
      <hr>
      <div class="row"><span>Sub total</span><span>${money(sale.subtotal)}</span></div>
      ${billDisc}
      <div class="tot"><span>TOTAL</span><span>${money(sale.total)}</span></div>
      <div class="row"><span>${esc(sale.payment_method)}</span><span>${money(sale.tendered)}</span></div>
      <div class="row"><span>Balance</span><span>${money(this.round2(sale.tendered - sale.total))}</span></div>
      <div class="bc">${code128Svg(sale.invoice_no)}<div>${esc(sale.invoice_no)}</div></div>
      <hr>
      <div class="c">*** COPY *** NOT A NEW SALE</div>
      ${sale.local ? '<div class="c">(saved on this terminal only)</div>' : ''}`);
  }

  // ---------- Suspend / Recall ----------

  // GET has a timeout and 1 retry. POST has a timeout only, so a slow server
  // cannot end up storing or recalling the same bill twice.
  private apiGet<T>(action: string, params: { [key: string]: string } = {}): Observable<T> {
    return this.http.get<T>(this.API, { params: { action, ...params } }).pipe(timeout(API_TIMEOUT_MS), retry(1));
  }



  private apiPost<T>(action: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.API}?action=${action}`, body).pipe(timeout(API_TIMEOUT_MS));
  }

  suspendBill(): void {
    const entries = this.getCartEntries();
    if (entries.length === 0) {
      alert('Cart is empty. Nothing to suspend.');
      return;
    }
    const items: SuspendedLine[] = entries.map(e => ({
      code: e.item.code, name: e.item.name, qty: e.qty, price: e.price,
      discount: this.lineDiscounts[e.itemIndex] || null,
      price_override: e.priceOverride
    }));
    const payload = {
      items,
      bill_discount: this.billDiscount,
      total: this.getCartTotal(),
      cashier: this.cashier,
      terminal: this.terminal
    };

    this.apiPost<any>('suspend_bill', payload).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.finishSuspend({ ...payload, suspend_no: res.suspend_no, created_at: this.utcToIso(res.created_at) });
        } else {
          alert('Suspend failed: ' + (res?.message || 'unknown server response'));
        }
      },
      error: (err) => {
        console.warn('suspend_bill API unavailable, saving on this terminal only', err);
        const bill: SuspendedBill = {
          ...payload,
          suspend_no: 'SUSL' + Date.now().toString().slice(-8),
          created_at: new Date().toISOString(),
          local: true
        };
        this.writeLocalBills([bill, ...this.readLocalBills()]);
        this.finishSuspend(bill);
      }
    });
  }

  private finishSuspend(bill: SuspendedBill): void {
    this.printSuspendSlip(bill);
    this.clearCart();
  }

  private esc = (v: any): string =>
    String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);

  private money = (n: number): string =>
    n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  printSuspendSlip(bill: SuspendedBill): void {
    const esc = this.esc;
    const money = this.money;
    const when = bill.created_at ? new Date(bill.created_at) : new Date();
    // Plain block rows, no table: some thermal printer drivers drop table cells
    let subTotal = 0;
    const lines = bill.items.map(l => {
      const gross = this.round2(l.qty * l.price);
      const disc = this.discountAmount(l.discount, gross);
      subTotal += gross - disc;
      return `
      <div class="item">${esc(l.name)}</div>
      <div class="row"><span>${l.qty} x ${money(l.price)}</span><span>${money(gross)}</span></div>` +
      (disc > 0 ? `<div class="row"><span>Discount ${esc(this.discountLabel(l.discount))}</span><span>-${money(disc)}</span></div>` : '');
    }).join('');
    subTotal = this.round2(subTotal);
    const billDisc = this.discountAmount(bill.bill_discount, subTotal);
    const billRows = billDisc > 0 ? `
      <hr>
      <div class="row"><span>Sub total</span><span>${money(subTotal)}</span></div>
      <div class="row"><span>Discount ${esc(this.discountLabel(bill.bill_discount))}</span><span>-${money(billDisc)}</span></div>` : '';

    this.printSlip(bill.suspend_no, `
      <h2>SUSPENDED BILL</h2>
      <div class="c">${esc(this.location)}</div>
      <hr>
      <div>No: ${esc(bill.suspend_no)}</div>
      <div>Date: ${esc(when.toLocaleString())}</div>
      <div>Terminal: ${esc(bill.terminal)} &nbsp; Cashier: ${esc(bill.cashier)}</div>
      <hr>
      ${lines}${billRows}
      <div class="tot"><span>TOTAL</span><span>${money(bill.total)}</span></div>
      <div class="bc">${code128Svg(bill.suspend_no)}<div>${esc(bill.suspend_no)}</div></div>
      <hr>
      <div class="c">NOT PAID. Scan this barcode at the POS to recall.</div>
      ${bill.local ? '<div class="c">(saved on this terminal only)</div>' : ''}`);
  }

  // Prints an 80mm slip from a hidden frame
  private printSlip(title: string, body: string): void {
    // Thick sans-serif text: thin fonts like Courier New fade out on thermal paper
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${this.esc(title)}</title>
      <style>
        @page { margin: 2mm; }
        * { color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        body { font-family: Arial, Tahoma, sans-serif; font-size: 13px; font-weight: 700; width: 72mm; margin: 0 auto; }
        h2 { font-size: 16px; text-align: center; margin: 2px 0; }
        .c { text-align: center; margin: 2px 0; }
        .item { margin-top: 4px; }
        .row { display: flex; justify-content: space-between; }
        .tot { display: flex; justify-content: space-between; font-size: 16px; border-top: 2px dashed #000; margin-top: 6px; padding-top: 4px; }
        .bc { text-align: center; margin-top: 8px; }
        .bc svg { max-width: 100%; height: 60px; }
        hr { border: 0; border-top: 2px dashed #000; margin: 4px 0; }
      </style></head><body>${body}</body></html>`;

    const frame = document.createElement('iframe');
    // Real slip width, moved off screen. A 0x0 frame can print with an empty layout.
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:80mm;height:200mm;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentWindow!.document;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      frame.contentWindow!.focus();
      frame.contentWindow!.print();
      setTimeout(() => frame.remove(), 1000);
    }, 250);
  }

  openRecall(): void {
    this.showRecall = true;
    this.recallInput = '';
    this.suspendedBills = this.readLocalBills();
    this.apiGet<any>('list_suspended').subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          const server = (res.data || []).map((b: any) => ({
            ...b, total: parseFloat(b.total), created_at: this.utcToIso(b.created_at)
          }));
          this.suspendedBills = [...server, ...this.readLocalBills()];
        }
      },
      error: (err) => console.warn('list_suspended API unavailable, showing local bills only', err)
    });
  }

  closeRecall(): void {
    this.showRecall = false;
  }



  recallBill(suspendNo: string): void {
    const no = suspendNo.trim().toUpperCase();
    if (!no) return;
    if (Object.keys(this.cart).length > 0) {
      alert('Finish, suspend or cancel the current bill before recalling another one.');
      return;
    }

    const local = this.readLocalBills();
    const localBill = local.find(b => b.suspend_no === no);
    if (localBill) {
      this.writeLocalBills(local.filter(b => b.suspend_no !== no));
      this.loadIntoCart(localBill.items, localBill.bill_discount);
      return;
    }

    this.apiPost<any>('recall_bill', { suspend_no: no }).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.loadIntoCart(res.items || [], res.bill_discount);
        } else {
          alert(res?.message || `Could not recall ${no}`);
        }
      },
      error: (err) => {
        console.warn('recall_bill API failed', err);
        alert(`Could not reach the server to recall ${no}. Try again.`);
      }
    });
  }

  private loadIntoCart(lines: SuspendedLine[], billDiscount?: Discount | null): void {
    this.cart = {};
    this.lineDiscounts = {};
    this.linePrices = {};
    this.billDiscount = billDiscount || null;
    const priceChanged: string[] = [];
    for (const line of lines) {
      let idx = this.items.findIndex(i => i.code === line.code);
      if (idx === -1) {
        this.items.push({ code: line.code, name: line.name, categoryName: '', price: line.price, stock: 0, trackImei: false });
        idx = this.items.length - 1;
      } else if (line.price_override) {
        this.linePrices[idx] = line.price;
      } else if (this.items[idx].price !== line.price) {
        priceChanged.push(`${line.name}: ${line.price} -> ${this.items[idx].price}`);
      }
      this.cart[idx] = (this.cart[idx] || 0) + line.qty;
      if (line.discount) this.lineDiscounts[idx] = line.discount;
    }
    this.tenderedAmount = 0;
    this.selectedCartIndex = null;
    this.closeRecall();
    if (priceChanged.length > 0) {
      alert('Prices changed since this bill was suspended. Current prices are used:\n' + priceChanged.join('\n'));
    }
  }

  // SQLite CURRENT_TIMESTAMP is UTC with no zone marker ("2026-10-01 19:32:02")
  private utcToIso(value: string): string {
    if (!value) return new Date().toISOString();
    return value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  }

  private readLocalBills(): SuspendedBill[] {
    return this.readLocal<SuspendedBill>(LOCAL_SUSPEND_KEY);
  }

  private writeLocalBills(bills: SuspendedBill[]): void {
    this.writeLocal(LOCAL_SUSPEND_KEY, bills);
  }

  private readLocal<T>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  private writeLocal(key: string, rows: any[]): void {
    try {
      localStorage.setItem(key, JSON.stringify(rows));
    } catch (e) {
      console.warn(`Could not save ${key} locally`, e);
    }
  }
}
