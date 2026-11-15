import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { rxResource } from '@angular/core/rxjs-interop';
import { HistoricalProjectionChartComponent } from '../../components/historical-projection-chart/historical-projection-chart.component';

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
  imports: [CommonModule, FormsModule, PageHeaderComponent, HistoricalProjectionChartComponent],
  templateUrl: './projections-page.component.html',
  styleUrl: './projections-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectionsPageComponent {
  private readonly projectionsService = inject(ProjectionsService);

  readonly mobileFiltersOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly response = signal<MonthlyProjectionResponse | null>(null);
  readonly items = signal<MonthlyProjectionItem[]>([]);
  readonly history = rxResource({ stream: () => this.projectionsService.getHarmonizedHistory() });
  readonly historyRecords = computed(() => this.history.hasValue() ? this.history.value().records : []);
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
    void this.loadProjection();
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

  private numberOrZero(value: number | null | undefined): number {
    return Number.isFinite(Number(value)) ? Number(value) : 0;
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
