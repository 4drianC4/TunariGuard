import { LanguageService } from '../../../../core/i18n/language.service';
import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { HistoryService } from '../../../../application/services/history.service';
import { HarmonizationService, AnalysisArea, AnalysisEvent } from '../../../../application/services/harmonization.service';
import type { HistoryApiResponse } from '../../../../domain/models/historical-record.model';
import { HarmonizationMapComponent } from '../../components/harmonization-map/harmonization-map.component';

@Component({
  selector: 'app-harmonization-page',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, HarmonizationMapComponent],
  templateUrl: './harmonization-page.component.html',
  styleUrl: './harmonization-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarmonizationPageComponent {
  readonly t = inject(LanguageService).text;
  readonly areaText = inject(LanguageService).area;
  readonly locale = inject(LanguageService).locale;
  private readonly historyService = inject(HistoryService);
  private readonly harmonizationService = inject(HarmonizationService);

  readonly areas = signal<readonly AnalysisArea[]>([]);
  readonly areaNames = computed(() => new Map(this.areas().map((area) => [area.area_id, area.nombre_visible])));
  readonly areasLoading = signal(false);
  readonly mobileFiltersOpen = signal(false);
  readonly areasError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly modisTotal = signal<number | null>(null);
  readonly viirsTotal = signal<number | null>(null);
  readonly harmonizedTotal = signal<number | null>(null);
  readonly coverageLabel = signal('—');

  readonly modisSeries = signal<readonly { year: number; total: number | null }[]>([]);
  readonly viirsSeries = signal<readonly { year: number; total: number | null }[]>([]);
  readonly harmonizedSeries = signal<readonly { year: number; total: number | null }[]>([]);
  readonly events = signal<readonly AnalysisEvent[]>([]);
  readonly eventPage = signal(1);
  readonly eventPageSize = 8;
  readonly eventTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.events().length / this.eventPageSize)),
  );
  readonly paginatedEvents = computed(() => {
    const start = (this.eventPage() - 1) * this.eventPageSize;
    return this.events().slice(start, start + this.eventPageSize);
  });

  startYear = 2001;
  endYear = new Date().getFullYear();
  areaId = 'parque-tunari';
  modis = true;
  viirs = true;

  readonly chartRange = signal({ start: this.startYear, end: this.endYear });
  readonly chartYears = computed(() => {
    const range = this.chartRange();
    const years: number[] = [];
    for (let year = range.start; year <= range.end; year++) years.push(year);
    return years;
  });

  readonly chartWidth = computed(() => Math.max(620, this.chartYears().length * 42 + 64));

  readonly chartMax = computed(() => {
    const values = [...this.modisSeries(), ...this.viirsSeries(), ...this.harmonizedSeries()]
      .map(item => item.total)
      .filter((value): value is number => value !== null);
    return Math.max(1, ...values);
  });

  readonly chartTicks = computed(() => {
    const max = this.chartMax();
    const step = max / 4;
    return [0, 1, 2, 3, 4].map(index => Math.round(step * index));
  });

  constructor() {
    this.loadAreas();
  }

  loadAreas(): void {
    this.areasLoading.set(true);
    this.areasError.set(null);
    this.harmonizationService.getAreas()
      .pipe(finalize(() => this.areasLoading.set(false)))
      .subscribe({
        next: areas => {
          this.areas.set(areas);
          if (!areas.some(area => area.area_id === this.areaId)) {
            this.areaId = areas.find(area => area.tipo === 'parque')?.area_id ?? areas[0]?.area_id ?? '';
          }
          this.apply();
        },
        error: err => this.areasError.set(err?.error?.message ?? 'No fue posible cargar las áreas.'),
      });
  }

  apply(): void {
    if (!this.areaId || !Number.isInteger(this.startYear) || !Number.isInteger(this.endYear)
      || this.startYear < 2000 || this.endYear > 2100 || this.startYear > this.endYear) {
      this.error.set('Selecciona un área y un rango de años válido (2000–2100).');
      return;
    }

    this.chartRange.update((range) =>
      range.start === this.startYear && range.end === this.endYear ? range : { start: this.startYear, end: this.endYear },
    );
    this.loading.set(true);
    this.error.set(null);

    const harmonized$ = this.historyService.getHistory({
      areaId: this.areaId, source: 'HARMONIZED', measure: 'celdas_dia',
      fromYear: this.startYear, toYear: this.endYear,
    });
    const modis$ = this.modis
      ? this.historyService.getHistory({ areaId: this.areaId, source: 'MODIS', measure: 'celdas_dia', fromYear: this.startYear, toYear: this.endYear })
      : of(null);
    const viirs$ = this.viirs
      ? this.historyService.getHistory({ areaId: this.areaId, source: 'VIIRS', measure: 'celdas_dia', fromYear: this.startYear, toYear: this.endYear })
      : of(null);

    forkJoin({
      harmonized: harmonized$,
      modis: modis$,
      viirs: viirs$,
      events: this.harmonizationService.getEvents({
        areaId: this.areaId,
        from: `${this.startYear}-01-01`,
        to: `${this.endYear}-12-31`,
        limit: 100,
      }),
    }).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: result => {
        this.harmonizedTotal.set(result.harmonized.summary.total);
        this.harmonizedSeries.set(this.toYearly(result.harmonized));
        this.modisTotal.set(result.modis?.summary.total ?? null);
        this.modisSeries.set(result.modis ? this.toYearly(result.modis) : []);
        this.viirsTotal.set(result.viirs?.summary.total ?? null);
        this.viirsSeries.set(result.viirs ? this.toYearly(result.viirs) : []);
        const years = result.harmonized.records.map(record => record.year);
        this.coverageLabel.set(years.length ? `${Math.min(...years)}–${Math.max(...years)}` : 'Sin datos');
        this.events.set(result.events);
        this.eventPage.set(1);
      },
      error: err => {
        this.error.set(err?.error?.message ?? 'No fue posible consultar el historial y los eventos.');
        this.modisTotal.set(null);
        this.viirsTotal.set(null);
        this.harmonizedTotal.set(null);
        this.modisSeries.set([]);
        this.viirsSeries.set([]);
        this.harmonizedSeries.set([]);
        this.events.set([]);
      },
    });
  }

  reset(): void {
    this.startYear = 2001;
    this.endYear = new Date().getFullYear();
    this.areaId = this.areas().find(area => area.tipo === 'parque')?.area_id ?? 'parque-tunari';
    this.modis = true;
    this.viirs = true;
    this.apply();
  }

  private toYearly(response: HistoryApiResponse): { year: number; total: number | null }[] {
    const values = new Map<number, number>();
    for (const record of response.records ?? []) {
      if (!Number.isInteger(record.year)) continue;
      if (record.activityCount === null || record.activityCount === undefined) continue;
      values.set(record.year, (values.get(record.year) ?? 0) + Number(record.activityCount));
    }

    return this.chartYears().map(year => ({
      year,
      total: values.has(year) ? values.get(year)! : null,
    }));
  }

  seriesPath(series: readonly { year: number; total: number | null }[]): string {
    const max = this.chartMax();
    const span = Math.max(this.chartYears().length - 1, 1);
    const segments: string[] = [];
    let drawing = false;

    series.forEach((item, index) => {
      if (item.total === null) {
        drawing = false;
        return;
      }
      const x = 32 + (index / span) * (this.chartWidth() - 64);
      const y = 150 - (item.total / max) * 130;
      segments.push(`${drawing ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`);
      drawing = true;
    });
    return segments.join(' ');
  }

  seriesPoints(series: readonly { year: number; total: number | null }[]): { x: number; y: number; label: string; value: number }[] {
    const max = this.chartMax();
    const span = Math.max(this.chartYears().length - 1, 1);
    return series.flatMap((item, index) => {
      if (item.total === null) return [];
      return [{
        x: 32 + (index / span) * (this.chartWidth() - 64),
        y: 150 - (item.total / max) * 130,
        label: String(item.year),
        value: item.total,
      }];
    });
  }


  previousEventPage(): void {
    this.eventPage.update(page => Math.max(1, page - 1));
  }

  nextEventPage(): void {
    this.eventPage.update(page => Math.min(this.eventTotalPages(), page + 1));
  }

  formatDate(value: string): string {
    if (!value) return '—';
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  formatSources(value: string): string[] {
    return (value ?? '').split('|').map(source => source.trim()).filter(Boolean);
  }

  trackEvent(_index: number, event: AnalysisEvent): string {
    return event.evento_id;
  }
}
