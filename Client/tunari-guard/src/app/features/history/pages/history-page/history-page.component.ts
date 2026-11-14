import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { MetricsService } from '../../../../application/services/metrics.service';
import { HistorySource, HistoryMeasure } from '../../../../domain/models/historical-record.model';
import { DistrictsService } from '../../../../application/services/districts.service';
import { District } from '../../../../domain/models/district.model';
import { HistoryCalendarComponent } from '../../components/history-calendar/history-calendar.component';
import { HistoryChartComponent } from '../../components/history-chart/history-chart.component';
import { HistoryTableComponent } from '../../components/history-table/history-table.component';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [DecimalPipe, HistoryCalendarComponent, HistoryChartComponent, HistoryTableComponent],
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryPageComponent {
  readonly metrics = inject(MetricsService);
  private readonly districtsService = inject(DistrictsService);
  readonly areas = signal<readonly District[]>([]);
  readonly areasLoading = signal(true);
  readonly areasError = signal<string | null>(null);

  readonly areaId = signal('');
  readonly source = signal<HistorySource>(this.metrics.selectedSource());
  readonly measure = signal<HistoryMeasure>(this.metrics.selectedMeasure());
  readonly fromYear = signal<number | null>(this.metrics.selectedFromYear());
  readonly toYear = signal<number | null>(this.metrics.selectedToYear());
  readonly filterError = signal<string | null>(null);

  readonly sourceOptions: { value: HistorySource; label: string }[] = [
    { value: 'HARMONIZED', label: 'ARMONIZADO' },
    { value: 'MODIS', label: 'MODIS' },
    { value: 'VIIRS', label: 'VIIRS' },
  ];

  readonly measureOptions: { value: HistoryMeasure; label: string }[] = [
    { value: '', label: 'Vacío (sin especificar)' },
    { value: 'celdas_dia', label: 'Celdas-día' },
    { value: 'detecciones', label: 'Detecciones' },
  ];

  readonly yearsCovered = computed(() =>
    new Set(this.metrics.records().map(record => record.year)).size,
  );

  readonly peakMonthLabel = computed(() => {
    const peak = this.metrics.peakMonth();
    if (!peak) return 'Sin datos';
    const month = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][peak.month - 1];
    return `${month} ${peak.year}`;
  });

  constructor() {
    this.loadAreas();
  }

  private loadAreas(): void {
    this.areasLoading.set(true);
    this.districtsService.getDistricts().subscribe({
      next: areas => {
        this.areas.set(areas);
        this.areasLoading.set(false);

        const defaultArea = areas.find(area => area.area_id === 'parque-tunari') ?? areas[0];
        if (defaultArea) {
          this.areaId.set(defaultArea.area_id);
          this.applyFilters();
        } else {
          this.areasError.set('El endpoint no devolvió áreas disponibles.');
        }
      },
      error: error => {
        this.areasLoading.set(false);
        this.areasError.set(error?.error?.message ?? 'No fue posible cargar las áreas.');
      },
    });
  }

  onAreaChange(value: string): void { this.areaId.set(value); }
  onSourceChange(value: string): void { this.source.set(value as HistorySource); }
  onMeasureChange(value: string): void { this.measure.set(value as HistoryMeasure); }
  onFromYearChange(value: string): void { this.fromYear.set(value ? Number(value) : null); }
  onToYearChange(value: string): void { this.toYear.set(value ? Number(value) : null); }

  applyFilters(): void {
    const areaId = this.areaId().trim();
    const fromYear = this.fromYear();
    const toYear = this.toYear();

    if (!areaId) {
      this.filterError.set('Ingresa el identificador del área.');
      return;
    }
    if (fromYear !== null && (!Number.isInteger(fromYear) || fromYear < 1900 || fromYear > 2200)) {
      this.filterError.set('El año inicial debe ser un año válido.');
      return;
    }
    if (toYear !== null && (!Number.isInteger(toYear) || toYear < 1900 || toYear > 2200)) {
      this.filterError.set('El año final debe ser un año válido.');
      return;
    }
    if (fromYear !== null && toYear !== null && fromYear > toYear) {
      this.filterError.set('El año inicial no puede ser posterior al año final.');
      return;
    }

    this.filterError.set(null);
    this.metrics.applyFilters({
      areaId,
      source: this.source(),
      measure: this.measure(),
      fromYear,
      toYear,
    });
  }

  clearFilters(): void {
    const defaultArea = this.areas().find(area => area.area_id === 'parque-tunari') ?? this.areas()[0];
    this.areaId.set(defaultArea?.area_id ?? '');
    this.source.set('HARMONIZED');
    this.measure.set('celdas_dia');
    this.fromYear.set(2001);
    this.toYear.set(2026);
    this.applyFilters();
  }
}
