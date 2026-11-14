import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HotspotStoreService } from '../../../../application/services/hotspot-store.service';
import { Severity } from '../../../../domain/enums/severity.enum';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  readonly store = inject(HotspotStoreService);
  readonly alertsHigh = computed(() => this.store.hotspots().filter(h => h.severity === Severity.HIGH || h.severity === Severity.CRITICAL).length);
  readonly recent = computed(() => [...this.store.observations()]
    .sort((a,b) => b.acquiredAtUtc.localeCompare(a.acquiredAtUtc)).slice(0,4));
  readonly demoAlerts = [
    { level: 'Crítica', district: 'Tiquipaya', time: 'Hace 18 min', css: 'critical' },
    { level: 'Alta', district: 'Sacaba', time: 'Hace 37 min', css: 'high' },
    { level: 'Alta', district: 'Vinto', time: 'Hace 1 h 12 min', css: 'high' },
    { level: 'Media', district: 'Colcapirhua', time: 'Hace 1 h 45 min', css: 'medium' },
  ];
}
