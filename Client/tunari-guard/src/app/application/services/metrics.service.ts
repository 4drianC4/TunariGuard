import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';

import { HistoryService } from './history.service';
import {
  HistoricalRecord,
  HistoryApiResponse,
  HistoryMeasure,
  HistorySource,
  HistorySummary,
} from '../../domain/models/historical-record.model';
import { DataOrigin } from '../../domain/enums/data-origin.enum';

export interface YearlyHistoryTotal {
  readonly year: number;
  readonly total: number;
}

const EMPTY_SUMMARY: HistorySummary = {
  total: 0,
  monthsWithData: 0,
  monthlyAverage: 0,
  peak: null,
};

@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly historyService = inject(HistoryService);
  private request?: Subscription;

  private readonly recordsState = signal<readonly HistoricalRecord[]>([]);
  readonly records = this.recordsState.asReadonly();

  readonly selectedSource = signal<HistorySource>('HARMONIZED');
  readonly selectedMeasure = signal<HistoryMeasure>('celdas_dia');
  readonly selectedAreaId = signal('parque-tunari');
  readonly selectedFromYear = signal<number | null>(2001);
  readonly selectedToYear = signal<number | null>(2026);

  readonly area = signal<HistoryApiResponse['area'] | null>(null);
  readonly unit = signal('celdas-día MODIS-equivalentes');
  readonly notice = signal('Una detección satelital de calor no es un incendio confirmado. Índice armonizado relativo: no son hectáreas ni número de incendios.');
  readonly summary = signal<HistorySummary>(EMPTY_SUMMARY);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalActivity = computed(() => this.summary().total);
  readonly monthsWithData = computed(() => this.summary().monthsWithData);
  readonly monthlyAverage = computed(() => this.summary().monthlyAverage);
  readonly peakMonth = computed(() => this.summary().peak);

  readonly yearlyTotals = computed<readonly YearlyHistoryTotal[]>(() => {
    const totals = new Map<number, number>();
    for (const record of this.records()) {
      totals.set(record.year, (totals.get(record.year) ?? 0) + record.activityCount);
    }
    return Array.from(totals.entries())
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => a.year - b.year);
  });

  applyFilters(filters: {
    areaId: string;
    source: HistorySource;
    measure: HistoryMeasure;
    fromYear: number | null;
    toYear: number | null;
  }): void {
    this.request?.unsubscribe();
    this.selectedAreaId.set(filters.areaId);
    this.selectedSource.set(filters.source);
    this.selectedMeasure.set(filters.measure);
    this.selectedFromYear.set(filters.fromYear);
    this.selectedToYear.set(filters.toYear);
    this.loading.set(true);
    this.error.set(null);

    this.request = this.historyService.getHistory(filters).subscribe({
      next: response => {
        this.setResponse(response);
        this.loading.set(false);
      },
      error: err => {
        this.recordsState.set([]);
        this.summary.set(EMPTY_SUMMARY);
        this.area.set(null);
        this.loading.set(false);
        this.error.set(this.getErrorMessage(err));
      },
    });
  }

  private setResponse(response: HistoryApiResponse): void {
    this.area.set(response.area);
    this.unit.set(response.unit);
    this.notice.set(response.notice);
    this.summary.set(response.summary ?? EMPTY_SUMMARY);
    this.recordsState.set((response.records ?? []).map(record => ({
      year: record.year,
      month: record.month,
      source: record.source,
      activityCount: Number(record.activityCount ?? 0),
      origin: this.mapOrigin(record.origin),
      quality: record.quality,
    })));
  }

  private mapOrigin(origin: string): DataOrigin {
    if (origin === DataOrigin.NASA_FIRMS) return DataOrigin.NASA_FIRMS;
    if (origin === DataOrigin.SIMULATED) return DataOrigin.SIMULATED;
    return DataOrigin.IMPORTED;
  }

  private getErrorMessage(error: unknown): string {
    const candidate = error as { error?: { message?: string }; message?: string };
    return candidate?.error?.message ?? candidate?.message ??
      'No fue posible consultar el historial. Intenta nuevamente.';
  }

  getRecordsByYear(year: number): readonly HistoricalRecord[] {
    return this.records().filter(record => record.year === year);
  }
}
