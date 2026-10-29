import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-accounts',
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.scss']
})
export class AccountsComponent implements OnInit {
  activeTab = 'ledgers';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path ?? '';
    if (path === 'aging') {
      this.activeTab = 'aging';
    } else if (path === 'voucher') {
      this.activeTab = 'vouchers';
    } else if (path === 'cheques') {
      this.activeTab = 'cheques';
    }
  }
}

