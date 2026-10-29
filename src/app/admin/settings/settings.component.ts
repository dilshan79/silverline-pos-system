import { Component } from '@angular/core';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent {
  companyName = 'Silverline Telecommunication';
  vatRate = 18;
  currency = 'LKR';
  enableSmsAlerts = true;

  saveSettings(): void {
    alert('Settings saved successfully!');
  }
}
