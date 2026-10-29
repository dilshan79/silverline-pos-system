import { Directive, Input, TemplateRef, ViewContainerRef, OnInit } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Directive({ selector: '[appPermission]' })
export class PermissionDirective implements OnInit {
  @Input('appPermission') roles: string[] = [];

  constructor(
    private tpl: TemplateRef<any>,
    private vcr: ViewContainerRef,
    private auth: AuthService
  ) {}

  ngOnInit(): void {
    this.auth.currentUser$.subscribe(user => {
      this.vcr.clear();
      if (user && (this.roles.length === 0 || this.roles.includes(user.role))) {
        this.vcr.createEmbeddedView(this.tpl);
      }
    });
  }
}
