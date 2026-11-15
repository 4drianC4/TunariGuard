import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';

import { AlertsApi } from '../../../alerts/data-access/alerts-api.service';
import { HotspotMapComponent } from '../../../map/components/hotspot-map/hotspot-map.component';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { HistoricalProjectionChartComponent } from '../../../projections/components/historical-projection-chart/historical-projection-chart.component';
import { ProjectionsService } from '../../../../application/services/projections.service';
import { DashboardApi } from '../../data-access/dashboard-api.service';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [RouterLink, DatePipe, PageHeaderComponent, HotspotMapComponent, HistoricalProjectionChartComponent],
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPageComponent {
  private readonly api = inject(DashboardApi);
  private readonly alertsApi = inject(AlertsApi);
  private readonly factorFormat = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 2 });
  private readonly projectionsService = inject(ProjectionsService);

  readonly detections = resource({ loader: ({ abortSignal }) => this.api.detections(abortSignal) });
  readonly alerts = resource({
    loader: ({ abortSignal }) => this.alertsApi.list({ modo: 'live', origen: 'REAL', limit: 4 }, abortSignal),
  });
  readonly districts = resource({ loader: ({ abortSignal }) => this.api.districtCount(abortSignal) });
  readonly coverage = resource({ loader: ({ abortSignal }) => this.api.coverage(abortSignal) });
  readonly projectionHistory = rxResource({ stream: () => this.projectionsService.getHarmonizedHistory() });
  readonly projection = rxResource({ stream: () => this.projectionsService.getMonthly() });

  readonly historicalCoverage = computed(() => this.coverage.hasValue() ? this.coverage.value() : null);

  readonly alertsHigh = computed(() => {
    if (!this.alerts.hasValue()) return null;
    const { high, critical } = this.alerts.value().counts;
    return high + critical;
  });

  readonly factor = computed(() => {
    const factor = this.coverage.hasValue() ? this.coverage.value().factor : null;
    return factor === null ? null : this.factorFormat.format(factor);
  });
}
