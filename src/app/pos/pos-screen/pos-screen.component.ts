import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { retry, timeout } from 'rxjs/operators';
import { Item } from '../../core/models';
import { code128Svg } from '../../shared/utils/code128';

interface SuspendedLine { code: string; name: string; qty: number; price: number; }
interface SuspendedBill {
  suspend_no: string;
  items: SuspendedLine[];
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
export class PosScreenComponent implements OnInit {
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

  showKeypad: boolean = false;
  keypadInputStr: string = '';

  searchText: string = '';
  showRecall: boolean = false;
  recallInput: string = '';
  suspendedBills: SuspendedBill[] = [];
  cashier: string = 'Rashmika';
  terminal: string = '#1';
  location: string = 'MW - Bravo Bus Stand';

  currentDateTime: Date = new Date();
  private timer: any;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.timer = setInterval(() => {
      this.currentDateTime = new Date();
    }, 1000);
    this.http.get<any>('api.php?action=get_items').subscribe({
      next: (res) => {
        if (res && res.status === 'success' && res.data && res.data.length > 0) {
          this.items = res.data.map((i: any) => ({
            code: i.code,
            name: i.name,
            categoryName: i.category,
            price: parseFloat(i.price),
            stock: parseInt(i.stock),
            trackImei: i.track_imei == 1
          }));
        }
      }
    });
  }

  addToCart(index: number): void {
    this.cart[index] = (this.cart[index] || 0) + 1;
    this.selectedCartIndex = index;
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
      return {
        itemIndex: idx,
        item: this.items[idx],
        qty: this.cart[idx],
        subtotal: this.items[idx].price * this.cart[idx]
      };
    });
  }

  getCartTotal(): number {
    let total = 0;
    for (const key in this.cart) {
      const idx = parseInt(key);
      total += this.items[idx].price * this.cart[idx];
    }
    return total;
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
    if (!this.showKeypad) return;
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

  checkout(): void {
    const entries = this.getCartEntries();
    if (entries.length === 0) {
      alert('Cart is empty!');
      return;
    }
    const total = this.getCartTotal();
    const balance = this.getBalance();
    alert(`Checkout success!\nTotal: Rs ${total.toLocaleString()}\nTendered: Rs ${this.tenderedAmount.toLocaleString()}\nBalance: Rs ${balance.toLocaleString()}`);
    this.cart = {};
    this.tenderedAmount = 0;
    this.selectedCartIndex = null;
  }

  clearCart(): void {
    this.cart = {};
    this.tenderedAmount = 0;
    this.selectedCartIndex = null;
  }

  // ---------- Suspend / Recall ----------

  // GET has a timeout and 1 retry. POST has a timeout only, so a slow server
  // cannot end up storing or recalling the same bill twice.
  private apiGet<T>(action: string): Observable<T> {
    return this.http.get<T>(`api.php?action=${action}`).pipe(timeout(API_TIMEOUT_MS), retry(1));
  }

  private apiPost<T>(action: string, body: any): Observable<T> {
    return this.http.post<T>(`api.php?action=${action}`, body).pipe(timeout(API_TIMEOUT_MS));
  }

  suspendBill(): void {
    const entries = this.getCartEntries();
    if (entries.length === 0) {
      alert('Cart is empty. Nothing to suspend.');
      return;
    }
    const items: SuspendedLine[] = entries.map(e => ({
      code: e.item.code, name: e.item.name, qty: e.qty, price: e.item.price
    }));
    const payload = { items, total: this.getCartTotal(), cashier: this.cashier, terminal: this.terminal };

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

  printSuspendSlip(bill: SuspendedBill): void {
    const esc = (v: any) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as any)[c]);
    const money = (n: number) => n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const when = bill.created_at ? new Date(bill.created_at) : new Date();
    const lines = bill.items.map(l => `
      <tr><td colspan="3">${esc(l.name)}</td></tr>
      <tr><td>${esc(l.code)}</td><td class="r">${l.qty} x ${money(l.price)}</td><td class="r">${money(l.qty * l.price)}</td></tr>`).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(bill.suspend_no)}</title>
      <style>
        @page { size: 80mm auto; margin: 3mm; }
        body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0 auto; color: #000; }
        h2, .c { text-align: center; margin: 2px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; vertical-align: top; }
        .r { text-align: right; }
        .tot td { border-top: 1px dashed #000; font-weight: bold; font-size: 14px; padding-top: 4px; }
        .bc { text-align: center; margin-top: 8px; }
        .bc svg { max-width: 100%; height: 60px; }
        hr { border: 0; border-top: 1px dashed #000; }
      </style></head><body>
      <h2>SUSPENDED BILL</h2>
      <div class="c">${esc(this.location)}</div>
      <hr>
      <div>No: <b>${esc(bill.suspend_no)}</b></div>
      <div>Date: ${esc(when.toLocaleString())}</div>
      <div>Terminal: ${esc(bill.terminal)} &nbsp; Cashier: ${esc(bill.cashier)}</div>
      <hr>
      <table>${lines}
        <tr class="tot"><td colspan="2">TOTAL</td><td class="r">${money(bill.total)}</td></tr>
      </table>
      <div class="bc">${code128Svg(bill.suspend_no)}<div>${esc(bill.suspend_no)}</div></div>
      <hr>
      <div class="c">NOT PAID. Scan this barcode at the POS to recall.</div>
      ${bill.local ? '<div class="c">(saved on this terminal only)</div>' : ''}
      </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
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

  // Barcode scanners type the code and press Enter in the search box
  onSearchEnter(): void {
    const value = this.searchText.trim().toUpperCase();
    if (value.startsWith('SUS')) {
      this.searchText = '';
      this.recallBill(value);
    }
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
      this.loadIntoCart(localBill.items);
      return;
    }

    this.apiPost<any>('recall_bill', { suspend_no: no }).subscribe({
      next: (res) => {
        if (res && res.status === 'success') {
          this.loadIntoCart(res.items || []);
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

  private loadIntoCart(lines: SuspendedLine[]): void {
    this.cart = {};
    const priceChanged: string[] = [];
    for (const line of lines) {
      let idx = this.items.findIndex(i => i.code === line.code);
      if (idx === -1) {
        this.items.push({ code: line.code, name: line.name, categoryName: '', price: line.price, stock: 0, trackImei: false });
        idx = this.items.length - 1;
      } else if (this.items[idx].price !== line.price) {
        priceChanged.push(`${line.name}: ${line.price} -> ${this.items[idx].price}`);
      }
      this.cart[idx] = (this.cart[idx] || 0) + line.qty;
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
    try {
      return JSON.parse(localStorage.getItem(LOCAL_SUSPEND_KEY) || '[]');
    } catch {
      return [];
    }
  }

  private writeLocalBills(bills: SuspendedBill[]): void {
    try {
      localStorage.setItem(LOCAL_SUSPEND_KEY, JSON.stringify(bills));
    } catch (e) {
      console.warn('Could not save suspended bills locally', e);
    }
  }
}
