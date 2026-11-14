
import { Injectable, computed, signal } from '@angular/core';

import {
  HistoricalRecord,
  HistorySource,
} from '../../domain/models/historical-record.model';

import { getHistoryMock } from '../../data-access/mock/history.mock';

export interface YearlyHistoryTotal {
  readonly year: number;
  readonly total: number;
}

@Injectable({
  providedIn: 'root',
})
export class MetricsService {

  /**
   * Fuente seleccionada por el usuario.
   * Por defecto mostramos los datos armonizados.
   */
  private readonly source = signal<HistorySource>('HARMONIZED');

  readonly selectedSource = this.source.asReadonly();

  /**
   * Registros correspondientes a la fuente seleccionada.
   */
  readonly records = computed<readonly HistoricalRecord[]>(() =>
    getHistoryMock(this.source()),
  );

  /**
   * Cantidad total de actividad del periodo seleccionado.
   */
  readonly totalActivity = computed(() =>
    this.records().reduce(
      (total, record) => total + record.activityCount,
      0,
    ),
  );

  /**
   * Mes con mayor actividad registrada.
   */
  readonly peakMonth = computed<HistoricalRecord | null>(() => {
    const records = this.records();

    if (records.length === 0) {
      return null;
    }

    return records.reduce((peak, current) =>
      current.activityCount > peak.activityCount
        ? current
        : peak,
    );
  });

  /**
   * Agrupa la actividad por año.
   * Será útil para construir gráficas y estadísticas.
   */
  readonly yearlyTotals = computed<readonly YearlyHistoryTotal[]>(() => {
    const totals = new Map<number, number>();

    for (const record of this.records()) {
      const currentTotal = totals.get(record.year) ?? 0;

      totals.set(
        record.year,
        currentTotal + record.activityCount,
      );
    }

    return Array.from(totals.entries())
      .map(([year, total]) => ({ year, total }))
      .sort((a, b) => a.year - b.year);
  });

  /**
   * Cambia la fuente de información.
   */
  selectSource(source: HistorySource): void {
    this.source.set(source);
  }

  /**
   * Obtiene los registros de un año específico.
   */
  getRecordsByYear(year: number): readonly HistoricalRecord[] {
    return this.records().filter(
      (record) => record.year === year,
    );
  }
}
