import { LanguageService } from '../../../../core/i18n/language.service';
import { DistrictAnalysisComponent } from '../../components/district-analysis/district-analysis.component';
import { DetectionDatesService } from '../../../../application/services/detection-dates.service';
import { DetectionDateDirective } from '../../../../shared/directives/detection-date.directive';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../../../shared/components/page-header/page-header.component';
import { MapInfoComponent } from '../../../map/components/map-info.component';
import { MapAnalysisService, type DistrictBoundaries } from '../../../map/data-access/map-analysis.service';
import { MapDataService } from '../../../map/data-access/map-data.service';
import { Observation } from '../../../map/models/observation.model';
import { DistrictMapComponent } from '../../components/district-map/district-map.component';
import { ACTIVITY, DistrictActivity } from '../../district-activity';

const boliviaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' });
const shortDate = new Intl.DateTimeFormat('es-BO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DEFAULT_ARCHIVE_FROM = '2016-01-01';

function shiftDate(date: string, days: number): string {
  const value = new Date(date + 'T00:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-districts-page',
  imports: [DetectionDateDirective, FormsModule, PageHeaderComponent, MapInfoComponent, DistrictMapComponent, DistrictAnalysisComponent],
  templateUrl: './districts-page.component.html',
  styleUrl: './districts-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DistrictsPageComponent {
  readonly t = inject(LanguageService).text;
  readonly areaText = inject(LanguageService).area;
  readonly dates = inject(DetectionDatesService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly analysis = inject(MapAnalysisService);
  private readonly mapData = inject(MapDataService);
  private request?: AbortController;
  private latestArchiveDate?: string;

  readonly levels = ACTIVITY;
  readonly boundaries = signal<DistrictBoundaries | null>(null);
  readonly observations = signal<Observation[]>([]);
  readonly selectedId = signal('');
  readonly applied = signal({ from: DEFAULT_ARCHIVE_FROM, to: boliviaDate.format(new Date()), source: 'archive', district: '', level: '' });
  readonly period = signal(7);
  readonly mobileFiltersOpen = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly validation = signal('');
  readonly focusRequest = signal(0);

  dateFrom = this.applied().from;
  dateTo = this.applied().to;
  source = this.applied().source;
  district = '';
  level = '';

  private readonly days = computed(() => {
    const { from, to } = this.applied();
    return Array.from({ length: this.period() }, (_, index) => shiftDate(to, index - this.period() + 1))
      .filter((day) => day >= from);
  });
  readonly chartDays = computed(() => this.days().map((day) => shortDate.format(new Date(day))));

  readonly districts = computed<DistrictActivity[]>(() => {
    const { from, to } = this.applied();
    const latestWeek = shiftDate(to, -6);
    const previousWeek = shiftDate(to, -13);
    const days = this.days();
    const dated = new Map<string, { row: Observation; day: string }[]>();
    for (const row of this.observations()) {
      if (!row.district) continue;
      const code = row.district.code;
      const entry = { row, day: boliviaDate.format(new Date(row.acquiredAtUtc)) };
      const existing = dated.get(code);
      if (existing) existing.push(entry);
      else dated.set(code, [entry]);
    }
    return (this.boundaries()?.features ?? []).map(({ properties }) => {
      const { id, name, provisional } = properties;
      const rows = dated.get(id) ?? [];
      const inRange = rows.filter(({ day }) => day >= from && day <= to);
      const currentWeekCount = rows.filter(({ day }) => day >= latestWeek && day <= to).length;
      const previousWeekCount = rows.filter(({ day }) => day >= previousWeek && day < latestWeek).length;
      const activity = ACTIVITY.filter(({ minimum }) => inRange.length >= minimum).at(-1) ?? ACTIVITY[0];
      const dailyCounts = new Map<string, number>();
      const sources = new Set<string>();
      let last: string | null = null;
      for (const { row, day } of inRange) {
        dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
        sources.add(row.sensor);
        if (!last || Date.parse(row.acquiredAtUtc) > Date.parse(last)) last = row.acquiredAtUtc;
      }
      return {
        id, name, provisional, areaKm2: properties.areaKm2, boundarySource: properties.source, count: inRange.length, delta: currentWeekCount - previousWeekCount,
        risk: activity.level, color: activity.color,
        observations: inRange.map(({ row }) => row), history: days.map((day) => dailyCounts.get(day) ?? 0), sources: [...sources].sort().join(', '), last,
      };
    }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es', { numeric: true }));
  });

  readonly visibleDistricts = computed(() => {
    const { district, level } = this.applied();
    return this.districts().filter((row) => (!district || row.id === district) && (!level || row.risk === level));
  });
  readonly total = computed(() => this.visibleDistricts().reduce((sum, row) => sum + row.count, 0));
  readonly activeCount = computed(() => this.visibleDistricts().filter((row) => row.count > 0).length);
  readonly highCount = computed(() => this.visibleDistricts().filter((row) => row.risk === 'Alto').length);
  readonly mostActive = computed(() => this.visibleDistricts().find((row) => row.count > 0));
  readonly current = computed(() => this.visibleDistricts().find((row) => row.id === this.selectedId()) ?? this.visibleDistricts()[0]);
  readonly chartTicks = computed(() => {
    const max = Math.max(0, ...(this.current()?.history ?? []));
    const step = Math.max(1, Math.ceil(max / 5));
    return Array.from({ length: 6 }, (_, i) => i * step);
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.request?.abort());
    void this.dates.load().then(() => {
      if (this.destroyRef.destroyed) return;
      const initial = this.applied();
      const from = this.dates.clamp(initial.from);
      const to = this.dates.clamp(initial.to);
      if (this.dateFrom === initial.from) this.dateFrom = from;
      if (this.dateTo === initial.to) this.dateTo = to;
      this.applied.set({ ...initial, from, to });
      return this.load(true);
    });
  }

  applyFilters(): void {
    const error = !this.dateFrom || !this.dateTo
      ? 'Selecciona un rango de fechas válido.'
      : this.dates.rangeError(this.dateFrom, this.dateTo);
    this.validation.set(error);
    if (error) return;
    const previous = this.applied();
    this.applied.set({ from: this.dateFrom, to: this.dateTo, source: this.source, district: this.district, level: this.level });
    this.mobileFiltersOpen.set(false);
    if (previous.from !== this.dateFrom || previous.to !== this.dateTo || previous.source !== this.source || this.error()) {
      void this.load();
    }
  }

  resetFilters(): void {
    this.dateFrom = this.dates.clamp(DEFAULT_ARCHIVE_FROM);
    this.dateTo = this.dates.clamp(this.latestArchiveDate ?? this.dates.today);
    this.source = 'archive';
    this.district = '';
    this.level = '';
    this.applyFilters();
  }

  async load(useLatestArchiveDate = false): Promise<void> {
    this.request?.abort();
    const request = new AbortController();
    this.request = request;
    this.error.set('');
    this.loading.set(true);
    this.observations.set([]);
    try {
      if (useLatestArchiveDate && this.applied().source === 'archive') {
        const latest = await this.analysis.latestDetectionDate('municipio-cochabamba', request.signal);
        if (request.signal.aborted) return;
        if (latest && latest >= this.applied().from) {
          const end = this.dates.clamp(latest);
          this.latestArchiveDate = end;
          if (this.dateTo === this.applied().to) this.dateTo = end;
          this.applied.update((filters) => ({ ...filters, to: end }));
        }
      }
      const { from, to, source } = this.applied();
      const compareFrom = shiftDate(to, -13);
      const range = { from: from < compareFrom ? from : compareFrom, to };
      const boundaries = this.boundaries() ?? this.analysis.districts(request.signal);
      const [geometry, rows] = await Promise.all([
        boundaries,
        source === 'archive'
          ? this.analysis.detections('municipio-cochabamba', range, undefined, undefined, [], '', false, request.signal)
          : this.mapData.loadObservations(range, { minConfidence: '', platforms: [] }, request.signal)
            .then(({ observations }) => observations),
      ]);
      if (request.signal.aborted) return;
      this.boundaries.set(geometry);
      this.observations.set(rows);
    } catch {
      if (!request.signal.aborted) this.error.set('No se pudieron cargar los distritos y sus detecciones.');
    } finally {
      if (!request.signal.aborted) this.loading.set(false);
    }
  }

  select(id: string): void { this.selectedId.set(id); }
  toggleFilters(): void { this.mobileFiltersOpen.update((open) => !open); }
  chartPoints(values: number[]): string { return values.map((v, i) => `${this.xAt(i, values.length)},${this.yAt(v)}`).join(' '); }
  xAt(i: number, length: number): number { return length === 1 ? 300 : 44 + i * 512 / Math.max(1, length - 1); }
  yAt(v: number): number { return 206 - v * 180 / this.chartTicks()[5]; }
  viewOnMap(): void {
    this.focusRequest.update((value) => value + 1);
    document.getElementById('tg-districts-map')?.scrollIntoView({ block: 'nearest' });
  }
}
