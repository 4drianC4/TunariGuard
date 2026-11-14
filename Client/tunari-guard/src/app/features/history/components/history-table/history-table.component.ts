import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { MetricsService } from '../../../../application/services/metrics.service';

@Component({
  selector: 'app-history-table',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './history-table.component.html',
  styleUrl: './history-table.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryTableComponent {
  private readonly metrics = inject(MetricsService);

  readonly selectedYear = signal<number | 'ALL'>('ALL');
  readonly currentPage = signal(1);
  readonly pageSize = 10;

  constructor() {
    effect(() => {
      this.metrics.records();
      this.selectedYear.set('ALL');
      this.currentPage.set(1);
    });
  }

  readonly years = computed(() => [...new Set(this.metrics.records().map(record => record.year))].sort((a, b) => b - a));

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

  // Los registros cambian automáticamente al cambiar la fuente global.
  readonly filteredRecords = computed(() => {
    const year = this.selectedYear();

    return [...this.metrics.records()]
      .filter((record) => year === 'ALL' || record.year === year)
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
  });

  readonly totalRecords = computed(() => this.filteredRecords().length);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.pageSize)),
  );

  readonly paginatedRecords = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;

    return this.filteredRecords().slice(start, start + this.pageSize);
  });

  readonly firstVisibleRecord = computed(() =>
    this.totalRecords() === 0
      ? 0
      : (this.currentPage() - 1) * this.pageSize + 1,
  );

  readonly lastVisibleRecord = computed(() =>
    Math.min(this.currentPage() * this.pageSize, this.totalRecords()),
  );

  selectYear(value: string): void {
    this.selectedYear.set(value === 'ALL' ? 'ALL' : Number(value));
    this.currentPage.set(1);
  }

  previousPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((page) => page - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((page) => page + 1);
    }
  }

  getMonthName(month: number): string {
    return this.monthNames[month - 1] ?? 'Desconocido';
  }

  getSourceLabel(source: string): string {
    const labels: Record<string, string> = {
      HARMONIZED: 'Armonizado',
      MODIS: 'MODIS',
      VIIRS: 'VIIRS',
    };

    return labels[source] ?? source;
  }

  formatQuality(quality: string): string {
    const labels: Record<string, string> = {
      aproximado_factor_transferido: 'Aproximado · Factor transferido',
      no_comparable: 'No comparable',
      calibrado_localmente_en_tunari: 'Calibrado localmente en Tunari',
    };

    return labels[quality] ?? quality.replace(/_/g, ' ');
  }
}