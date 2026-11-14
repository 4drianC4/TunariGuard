import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { MetricsService } from '../../../../application/services/metrics.service';
import { HistorySource } from '../../../../domain/models/historical-record.model';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPageComponent {
  readonly metrics = inject(MetricsService);

  readonly sources: {
    label: string;
    value: HistorySource;
  }[] = [
    { label: 'Armonizado', value: 'HARMONIZED' },
    { label: 'MODIS', value: 'MODIS' },
    { label: 'VIIRS', value: 'VIIRS' },
  ];

  readonly monthNames = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  // Nombre de la fuente seleccionada
  readonly sourceLabel = computed(() =>
    this.sources.find(
      source => source.value === this.metrics.selectedSource(),
    )?.label ?? 'Armonizado',
  );

  // Cantidad de años disponibles
  readonly yearsCovered = computed(() =>
    new Set(
      this.metrics.records().map(record => record.year),
    ).size,
  );

  // Promedio de actividad por mes con registro
  readonly monthlyAverage = computed(() => {
    const records = this.metrics.records();

    if (!records.length) return 0;

    return Math.round(
      this.metrics.totalActivity() / records.length,
    );
  });

  // Mes con mayor actividad
  readonly peakMonthLabel = computed(() => {
    const peak = this.metrics.peakMonth();

    if (!peak) return 'Sin datos';

    return `${this.monthNames[peak.month - 1]} ${peak.year}`;
  });

  // Cambiar fuente
  selectSource(source: HistorySource): void {
    this.metrics.selectSource(source);
  }
}
