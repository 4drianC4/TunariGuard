import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'app-alerts-page', standalone: true,
  templateUrl: './alerts-page.component.html',
  styleUrl: './alerts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlertsPageComponent {}