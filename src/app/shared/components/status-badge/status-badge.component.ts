import { Component, Input } from '@angular/core';

type BadgeStatus = 'active' | 'inactive' | 'pending' | 'completed' | 'pool' | 'assigned' | 'in-progress' | string;

@Component({
  selector: 'app-status-badge',
  templateUrl: './status-badge.component.html',
  styleUrls: ['./status-badge.component.scss']
})
export class StatusBadgeComponent {
  @Input() status: BadgeStatus = '';

  get cssClass(): string {
    const map: Record<string, string> = {
      active: 'g', completed: 'g', done: 'g',
      inactive: 'r', cancelled: 'r', void: 'r',
      pending: 'y', pool: 'y', assigned: 'y',
      'in-progress': 'b', 'in progress': 'b', progress: 'b'
    };
    return map[this.status?.toLowerCase()] || '';
  }
}
