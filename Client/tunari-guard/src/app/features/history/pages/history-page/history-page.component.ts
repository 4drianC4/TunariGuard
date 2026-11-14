import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { MetricsService } from '../../../../application/services/metrics.service';
import { HistorySource } from '../../../../domain/models/historical-record.model';
import { HistoryCalendarComponent } from '../../components/history-calendar/history-calendar.component';
import { HistoryChartComponent } from '../../components/history-chart/history-chart.component';
import { HistoryTableComponent } from '../../components/history-table/history-table.component';
import { DataOrigin } from '../../../../domain/enums/data-origin.enum';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [DecimalPipe, HistoryCalendarComponent, HistoryChartComponent, HistoryTableComponent, PageHeaderComponent],
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

  readonly originInfo = computed(() => {
    const records = this.metrics.records();

    if (records.length === 0) {
      return {
        type: 'EMPTY',
        label: 'Sin datos',
        description: 'No hay registros disponibles para esta fuente.',
      };
    }

    const origins = new Set(records.map((record) => record.origin));

    if (origins.size > 1) {
      return {
        type: 'MIXED',
        label: 'Procedencia mixta',
        description: 'Los registros tienen diferentes fuentes de procedencia.',
      };
    }

    const origin = records[0].origin;

    switch (origin) {
      case DataOrigin.SIMULATED:
        return {
          type: 'SIMULATED',
          label: 'Datos simulados',
          description: 'Información de demostración; no corresponde a observaciones reales.',
        };

      case DataOrigin.NASA_FIRMS:
        return {
          type: 'NASA_FIRMS',
          label: 'NASA FIRMS',
          description: 'Registros procedentes de NASA FIRMS.',
        };

      case DataOrigin.IMPORTED:
        return {
          type: 'IMPORTED',
          label: 'Datos importados',
          description: 'Registros procedentes de un conjunto de datos importado.',
        };

      default:
        return {
          type: 'UNKNOWN',
          label: 'Procedencia no identificada',
          description: 'No se pudo identificar el origen de los registros.',
        };
    }
  });

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
