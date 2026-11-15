import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HistoryService } from '../../../../application/services/history.service';
import { HistoricalRecord } from '../../../../domain/models/historical-record.model';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import {
  MonthlyProjectionItem,
  MonthlyProjectionResponse,
  ProjectionsService,
} from '../../../../application/services/projections.service';

interface ModelComparison {
  name: string;
  wapeMensual: number;
  wapeAnual: number;
  sesgo: number;
}

@Component({
  selector: 'app-projections-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './projections-page.component.html',
  styleUrl: './projections-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionsPageComponent {
  private readonly projectionsService = inject(ProjectionsService);
  private readonly historyService = inject(HistoryService);

  readonly mobileFiltersOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly response = signal<MonthlyProjectionResponse | null>(null);
  readonly items = signal<MonthlyProjectionItem[]>([]);
  readonly historyRecords = signal<HistoricalRecord[]>([]);
  readonly historyLoading = signal(false);
  readonly historyError = signal('');
  readonly notice = signal(
    'Proyección SIMULADA: un futuro posible según un modelo, no una predicción. Una detección satelital no confirma un incendio.',
  );

  draftDesde = '';
  draftHasta = '';
  appliedDesde = '';
  appliedHasta = '';
  message = '';

  readonly selectedModel = 'Binomial negativa';
  readonly evaluation = {
    wapeAnual: 41.2,
    cobertura: 91.5,
    coberturaNominal: 90,
    sesgo: -18.4,
  };

  readonly models: ModelComparison[] = [
    { name: 'Binomial negativa', wapeMensual: 53.0, wapeAnual: 41.2, sesgo: -18.4 },
    { name: 'ETS log', wapeMensual: 74.8, wapeAnual: 64.0, sesgo: 12.4 },
    { name: 'SARIMA log', wapeMensual: 61.5, wapeAnual: 47.7, sesgo: -42.7 },
  ];

  constructor() {
    void this.loadHistory();
    void this.loadProjection();
  }

  /** Historial armonizado real + proyección futura en una sola línea temporal. */
  get timeline(): { mes: string; value: number; type: 'history' | 'projection' }[] {
    const historical = this.historyRecords().map(record => ({
      mes: `${record.year}-${String(record.month).padStart(2, '0')}`,
      value: this.numberOrZero(record.activityCount),
      type: 'history' as const,
    }));
    const lastHistoricalMonth = historical.length ? historical[historical.length - 1].mes : '';
    const projected = this.items()
      .filter(item => !lastHistoricalMonth || item.mes > lastHistoricalMonth)
      .map(item => ({
        mes: item.mes,
        value: this.numberOrZero(item.indice_esperado_modelo),
        type: 'projection' as const,
      }));
    return [...historical, ...projected].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  get historyPoints(): string {
    const all = this.timeline;
    return all.map((point, index) => ({ point, index }))
      .filter(entry => entry.point.type === 'history')
      .map(({ point, index }) => `${this.chartX(index)},${this.chartY(point.value, this.maxTimelineValue)}`)
      .join(' ');
  }

  get projectionPoints(): string {
    const all = this.timeline;
    const firstProjectionIndex = all.findIndex(point => point.type === 'projection');
    if (firstProjectionIndex < 0) return '';
    // Añadir el último punto histórico como ancla para unir visualmente ambas etapas.
    const start = firstProjectionIndex > 0 ? firstProjectionIndex - 1 : firstProjectionIndex;
    return all.slice(start).map((point, offset) => {
      const index = start + offset;
      return `${this.chartX(index)},${this.chartY(point.value, this.maxTimelineValue)}`;
    }).join(' ');
  }

  get maxTimelineValue(): number {
    return Math.max(1, ...this.timeline.map(point => point.value));
  }

  get timelineTicks(): { index: number; label: string }[] {
    return this.timeline
      .map((point, index) => ({ index, label: point.mes.slice(0, 4), month: point.mes.slice(5, 7) }))
      .filter(point => point.month === '01' || point.index === 0)
      .map(({ index, label }) => ({ index, label }));
  }

  get hasTimeline(): boolean {
    return this.timeline.length > 0;
  }

  get hasHistoryAndProjection(): boolean {
    return this.timeline.some(point => point.type === 'history') && this.timeline.some(point => point.type === 'projection');
  }

  get projectionStartX(): number {
    const index = this.timeline.findIndex(point => point.type === 'projection');
    return index < 0 ? 0 : this.chartX(index);
  }

  get historyRangeLabel(): string {
    const points = this.timeline.filter(point => point.type === 'history');
    return points.length ? `${points[0].mes} – ${points[points.length - 1].mes}` : 'Sin historial';
  }

  get projectionRangeLabel(): string {
    const points = this.timeline.filter(point => point.type === 'projection');
    return points.length ? `${points[0].mes} – ${points[points.length - 1].mes}` : 'Sin proyección';
  }

  get totalEsperado(): number {
    return this.items().reduce((sum, item) => sum + this.numberOrZero(item.esperado_detecciones), 0);
  }

  get totalGenerado(): number {
    return this.items().reduce((sum, item) => sum + this.numberOrZero(item.detecciones_generadas), 0);
  }

  get indicePromedio(): number {
    const rows = this.items();
    return rows.length
      ? rows.reduce((sum, item) => sum + this.numberOrZero(item.indice_esperado_modelo), 0) / rows.length
      : 0;
  }

  get maxIndex(): number {
    return Math.max(1, ...this.items().map(item => this.numberOrZero(item.indice_esperado_modelo)));
  }

  get maxDetections(): number {
    return Math.max(
      1,
      ...this.items().flatMap(item => [
        this.numberOrZero(item.esperado_detecciones),
        this.numberOrZero(item.detecciones_generadas),
      ]),
    );
  }

  get expectedPoints(): string {
    return this.items().map((item, index) =>
      `${this.chartX(index)},${this.chartY(this.numberOrZero(item.esperado_detecciones), this.maxDetections)}`,
    ).join(' ');
  }

  get generatedPoints(): string {
    return this.items().map((item, index) =>
      `${this.chartX(index)},${this.chartY(this.numberOrZero(item.detecciones_generadas), this.maxDetections)}`,
    ).join(' ');
  }

  get indexPoints(): string {
    return this.items().map((item, index) =>
      `${this.chartX(index)},${this.chartY(this.numberOrZero(item.indice_esperado_modelo), this.maxIndex)}`,
    ).join(' ');
  }

  chartX(index: number): number {
    const count = this.timeline.length;
    return count <= 1 ? 550 : 62 + (index / (count - 1)) * 1030;
  }

  chartY(value: number, max: number): number {
    return 250 - (value / max) * 205;
  }

  barHeight(value: number): number {
    return Math.max(0, (this.numberOrZero(value) / this.maxIndex) * 100);
  }

  private numberOrZero(value: number | null | undefined): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  }

  private async loadHistory(): Promise<void> {
    this.historyLoading.set(true);
    this.historyError.set('');
    const currentYear = new Date().getFullYear();
    try {
      const response = await firstValueFrom(this.historyService.getHistory({
        areaId: 'parque-tunari',
        source: 'HARMONIZED',
        measure: 'celdas_dia',
        fromYear: 2004,
        toYear: currentYear,
      }));
      this.historyRecords.set((response.records ?? [])
        .filter(record => record.source === 'HARMONIZED')
        .map(record => ({
          year: Number(record.year),
          month: Number(record.month),
          source: record.source,
          activityCount: Number(record.activityCount ?? 0),
          origin: record.origin as HistoricalRecord['origin'],
          quality: record.quality,
        }))
        .sort((a, b) => a.year - b.year || a.month - b.month));
    } catch (err: unknown) {
      const backendMessage = (err as { error?: { message?: string } })?.error?.message;
      this.historyError.set(backendMessage || 'No fue posible cargar el historial armonizado.');
      this.historyRecords.set([]);
    } finally {
      this.historyLoading.set(false);
    }
  }

  async applyFilters(): Promise<void> {
    if (this.draftDesde && !this.isValidMonth(this.draftDesde)) {
      this.error.set('El formato de "Desde" debe ser YYYY-MM.');
      return;
    }
    if (this.draftHasta && !this.isValidMonth(this.draftHasta)) {
      this.error.set('El formato de "Hasta" debe ser YYYY-MM.');
      return;
    }
    if (this.draftDesde && this.draftHasta && this.draftDesde > this.draftHasta) {
      this.error.set('"Desde" debe ser anterior o igual a "Hasta".');
      return;
    }

    this.appliedDesde = this.draftDesde;
    this.appliedHasta = this.draftHasta;
    await this.loadProjection();
  }

  clearFilters(): void {
    this.draftDesde = '';
    this.draftHasta = '';
    this.appliedDesde = '';
    this.appliedHasta = '';
    void this.loadProjection();
  }

  private isValidMonth(value: string): boolean {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  }

  async loadProjection(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.message = '';

    try {
      const result = await firstValueFrom(this.projectionsService.getMonthly({
        desde: this.appliedDesde || undefined,
        hasta: this.appliedHasta || undefined,
      }));

      this.response.set(result);
      this.items.set(Array.isArray(result.items) ? result.items : []);
      this.notice.set(result.aviso || this.notice());
      this.message = `${this.items().length} meses cargados correctamente.`;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const backendMessage = (err as { error?: { message?: string } })?.error?.message;
      if (status === 400) {
        this.error.set(backendMessage || 'El backend rechazó el rango. Verifica el formato YYYY-MM y que "Desde" no sea posterior a "Hasta".');
      } else {
        this.error.set('No fue posible cargar la proyección mensual. Verifica la conexión con el servidor e inténtalo nuevamente.');
      }
      this.items.set([]);
      this.response.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  exportCsv(): void {
    const rows: (string | number)[][] = [
      ['mes', 'dias_simulados', 'indice_esperado_modelo', 'k_detecciones_por_celda_dia', 'esperado_detecciones', 'detecciones_generadas'],
      ...this.items().map(item => [
        item.mes,
        item.dias_simulados,
        item.indice_esperado_modelo,
        item.k_detecciones_por_celda_dia,
        item.esperado_detecciones,
        item.detecciones_generadas,
      ]),
    ];
    const csv = '\ufeff' + rows.map(row => row.map(value =>
      `"${String(value ?? '').replace(/"/g, '""')}"`,
    ).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'TunariGuard_Proyeccion_Mensual.csv';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
