import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  activeTab = 'users';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path ?? '';
    if (path === 'settings') {
      this.activeTab = 'settings';
    } else if (path === 'users') {
      this.activeTab = 'users';
    }
  }
}

