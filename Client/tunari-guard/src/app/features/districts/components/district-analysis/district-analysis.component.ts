import { LanguageService } from '../../../../core/i18n/language.service';
import { Component, computed, inject, input, output, resource, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MapAnalysisService } from '../../../map/data-access/map-analysis.service';
import { MapInfoComponent } from '../../../map/components/map-info.component';
import type { Observation, SatellitePlatform } from '../../../map/models/observation.model';
import type { DistrictActivity } from '../../district-activity';

const satellites: Record<SatellitePlatform, string> = {
  TERRA: 'Terra', AQUA: 'Aqua', SNPP: 'Suomi NPP', NOAA20: 'NOAA-20', NOAA21: 'NOAA-21',
};
const monthNames = new Intl.DateTimeFormat('es-BO', { month: 'short', timeZone: 'UTC' });

function counts(rows: readonly Observation[], label: (row: Observation) => string) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const name = label(row);
    totals.set(name, (totals.get(name) ?? 0) + 1);
  }
  return [...totals].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

@Component({
  selector: 'app-district-analysis',
  imports: [DatePipe, DecimalPipe, MapInfoComponent],
  templateUrl: './district-analysis.component.html',
  styleUrl: './district-analysis.component.scss',
})
export class DistrictAnalysisComponent {
  readonly t = inject(LanguageService).text;
  readonly areaText = inject(LanguageService).area;
  readonly locale = inject(LanguageService).locale;
  readonly dateFormat = () => this.locale() === 'es-BO' ? 'dd/MM/yyyy HH:mm' : 'short';
  private readonly api = inject(MapAnalysisService);
  readonly district = input.required<DistrictActivity>();
  readonly mapFocus = output<void>();
  readonly inspectedMonth = signal<number | null>(null);
  private readonly districtId = computed(() => this.district().id);
  readonly sections = ['Detecciones', 'Potencia y confianza', 'Historial'] as const;
  readonly section = signal<typeof this.sections[number]>('Detecciones');
  readonly year = signal<number | null>(null);

  readonly monthly = resource({
    params: () => this.districtId(),
    loader: ({ params, abortSignal }) => this.api.districtMonthlyActivity(params, abortSignal),
  });
  readonly trends = resource({
    params: () => this.districtId(),
    loader: ({ params, abortSignal }) => this.api.districtTrends(params, abortSignal),
  });

  readonly density = computed(() => {
    const { areaKm2, count } = this.district();
    return areaKm2 && areaKm2 > 0 ? count / areaKm2 : null;
  });
  readonly breakdown = computed(() => {
    const rows = this.district().observations;
    return [
      { title: 'Sensores', entries: counts(rows, (row) => row.sensor) },
      { title: 'Satélites', entries: counts(rows, (row) => satellites[row.platform]) },
      { title: 'Día y noche', entries: counts(rows, (row) => row.dayNight === 'DAY' ? 'Día' : row.dayNight === 'NIGHT' ? 'Noche' : 'Sin dato') },
    ];
  });
  readonly quality = computed(() => {
    const rows = this.district().observations;
    const powers = rows.flatMap(({ frpMw }) => frpMw == null ? [] : [frpMw]);
    const confidence = counts(rows, ({ confidenceLevel }) => {
      if (confidenceLevel === 'HIGH') return 'Alta';
      if (confidenceLevel === 'NOMINAL') return 'Nominal';
      return confidenceLevel === 'LOW' ? 'Baja' : 'Sin dato';
    });
    return {
      reportedFrp: powers.length,
      mean: powers.length ? powers.reduce((sum, value) => sum + value, 0) / powers.length : null,
      max: powers.length ? powers.reduce((max, value) => Math.max(max, value)) : null,
      reportedConfidence: rows.filter(({ confidenceLevel }) => confidenceLevel != null).length,
      confidence,
    };
  });
  readonly years = computed(() => [...new Set((this.monthly.hasValue() ? this.monthly.value().records : [])
    .filter(({ activityCount }) => activityCount != null).map(({ year }) => year))].sort((a, b) => b - a));
  readonly activeYear = computed(() => {
    const year = this.year();
    return year != null && this.years().includes(year) ? year : this.years()[0];
  });
  readonly months = computed(() => {
    const records = this.monthly.hasValue() ? this.monthly.value().records : [];
    const active = records.filter(({ year }) => year === this.activeYear());
    const peak = Math.max(1, ...active.map(({ activityCount }) => activityCount ?? 0));
    return Array.from({ length: 12 }, (_, index) => {
      const value = active.find(({ month }) => month === index + 1)?.activityCount ?? null;
      return { label: monthNames.format(new Date(Date.UTC(2000, index, 1))), value, percent: value == null ? 0 : value / peak * 100 };
    });
  });

  readonly activeMonth = computed(() => {
    const months = this.months();
    const index = this.inspectedMonth();
    return index === null ? months.reduce((peak, month) => (month.value ?? -1) > (peak.value ?? -1) ? month : peak) : months[index];
  });

  readonly annualComparison = computed(() => {
    if (!this.monthly.hasValue()) return null;
    const records = this.monthly.value().records;
    const complete = this.years().flatMap((year) => {
      const values = records.filter((row) => row.year === year && row.activityCount != null);
      if (new Set(values.map(({ month }) => month)).size !== 12) return [];
      return [{ year, total: values.reduce((sum, row) => sum + (row.activityCount ?? 0), 0) }];
    });
    const [latest, previous] = complete;
    if (!latest || !previous || latest.year - previous.year !== 1) return null;
    return { latest, previous, change: latest.total - previous.total };
  });

  trendLabel(series: string): string {
    return series.replaceAll('_', ' ');
  }
}
