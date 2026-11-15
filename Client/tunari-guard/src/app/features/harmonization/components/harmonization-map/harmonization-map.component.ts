import { LanguageService } from '../../../../core/i18n/language.service';
import { DecimalPipe } from '@angular/common';
import {
  AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy,
  computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import * as L from 'leaflet';
import { catchError, forkJoin, from, map, mergeMap, of, toArray } from 'rxjs';
import {
  HarmonizationService, type AnalysisArea, type HarmonizationPeriod,
} from '../../../../application/services/harmonization.service';
import { HistoryService } from '../../../../application/services/history.service';
import type { HistorySummary } from '../../../../domain/models/historical-record.model';
import { addBoliviaBasemap } from '../../../map/utils/map-basemap';

type MappedArea = Feature<Polygon | MultiPolygon, AnalysisArea>;

interface AreaCoverage {
  readonly summary: HistorySummary;
  readonly unit: string;
  readonly notice: string;
}

type CoverageEntry = readonly [areaId: string, coverage: AreaCoverage | null];

const fills = { covered: '#70833a', missing: '#b6aea0', unavailable: '#c59661' };

@Component({
  selector: 'app-harmonization-map',
  imports: [DecimalPipe],
  templateUrl: './harmonization-map.component.html',
  styleUrl: './harmonization-map.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HarmonizationMapComponent implements AfterViewInit, OnDestroy {
  private readonly i18n = inject(LanguageService);
  readonly t = this.i18n.text;
  readonly areaText = inject(LanguageService).area;
  readonly locale = inject(LanguageService).locale;
  readonly period = input.required<HarmonizationPeriod>();
  readonly fills = fills;
  readonly selectedId = signal('');

  private readonly api = inject(HarmonizationService);
  private readonly history = inject(HistoryService);
  private readonly canvas = viewChild.required<ElementRef<HTMLDivElement>>('mapCanvas');
  private readonly mapReady = signal(false);
  private map?: L.Map;
  private layer?: L.GeoJSON;
  private resize?: ResizeObserver;
  private readonly shapes = new Map<string, L.Polygon>();

  readonly boundaries = rxResource({
    stream: () => this.api.getAreaBoundaries().pipe(
      map(({ features }) => features.filter((feature): feature is MappedArea =>
        feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon',
      )),
    ),
  });

  readonly areas = computed(() => this.boundaries.hasValue() ? this.boundaries.value() : []);
  readonly coverage = rxResource({
    params: () => this.boundaries.hasValue() && this.areas().length
      ? { areas: this.areas(), period: this.period(), language: this.i18n.language() }
      : undefined,
    stream: ({ params }) => this.loadCoverage(params.areas, params.period),
  });

  private readonly coverageByArea = computed(() => this.coverage.hasValue() ? this.coverage.value() : undefined);
  readonly selectedArea = computed(() => this.areas().find((area) => area.properties.area_id === this.selectedId()));
  readonly selectedCoverage = computed(() => this.coverageByArea()?.get(this.selectedId()));
  readonly comparableCount = computed(() => this.areas().filter(
    (area) => (this.coverageByArea()?.get(area.properties.area_id)?.summary.monthsWithData ?? 0) > 0,
  ).length);
  readonly failedCount = computed(() => this.areas().filter(
    (area) => this.coverageByArea()?.get(area.properties.area_id) === null,
  ).length);

  constructor() {
    effect(() => {
      const areas = this.areas();
      if (this.mapReady()) untracked(() => this.drawAreas(areas));
    });
    effect(() => {
      const coverage = this.coverageByArea();
      const selected = this.selectedId();
      if (this.mapReady()) this.updateStyles(coverage, selected);
    });
  }

  ngAfterViewInit(): void {
    const canvas = this.canvas().nativeElement;
    this.map = L.map(canvas, { scrollWheelZoom: false }).setView([-17.2, -66.2], 8);
    addBoliviaBasemap(this.map);
    L.control.scale({ imperial: false }).addTo(this.map);
    this.resize = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
    this.resize.observe(canvas);
    this.mapReady.set(true);
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.map?.remove();
  }

  selectArea(id: string, zoom = true): void {
    this.selectedId.set(id);
    if (!zoom) return;

    const bounds = id ? this.shapes.get(id)?.getBounds() : this.layer?.getBounds();
    if (bounds?.isValid()) this.map?.fitBounds(bounds, { padding: [18, 18], maxZoom: 13, animate: false });
  }

  private loadCoverage(areas: MappedArea[], period: HarmonizationPeriod) {
    const districtIds = areas.filter(({ properties }) => properties.tipo === 'distrito')
      .map(({ properties }) => properties.area_id);
    const districts = districtIds.length
      ? this.api.getDistrictHistory(period).pipe(
        map(({ districts, notice, unit }) => {
          const summaries = new Map(districts.map((district) => [district.area_id, district.summary]));
          return districtIds.map((id): CoverageEntry => {
            const summary = summaries.get(id);
            return [id, summary ? { summary, notice, unit } : null];
          });
        }),
        catchError(() => of(districtIds.map((id): CoverageEntry => [id, null]))),
      )
      : of([]);

    const others = from(areas.filter(({ properties }) => properties.tipo !== 'distrito')).pipe(
      mergeMap(({ properties: { area_id: id } }) => this.history.getHistory({
        areaId: id, source: 'HARMONIZED', measure: 'celdas_dia', fromYear: period.start, toYear: period.end,
      }).pipe(
        map(({ summary, notice, unit }): CoverageEntry => [id, { summary, notice, unit }]),
        catchError(() => of<CoverageEntry>([id, null])),
      ), 4),
      toArray(),
    );

    return forkJoin([districts, others]).pipe(map(([group, individual]) => new Map([...group, ...individual])));
  }

  private drawAreas(areas: MappedArea[]): void {
    if (!this.map) return;
    this.layer?.remove();
    this.shapes.clear();
    const ordered = [
      ...areas.filter((area) => area.properties.tipo !== 'distrito'),
      ...areas.filter((area) => area.properties.tipo === 'distrito'),
    ];
    this.layer = L.geoJSON(ordered, {
      onEachFeature: ({ properties }, shape) => {
        if (!(shape instanceof L.Polygon)) return;
        const id = properties.area_id;
        this.shapes.set(id, shape);
        shape.on('click', () => this.selectArea(id, false));
        shape.on('add', () => {
          const element = shape.getElement();
          element?.setAttribute('tabindex', '0');
          element?.setAttribute('role', 'button');
          element?.addEventListener('keydown', (event) => {
            const key = (event as KeyboardEvent).key;
            if (key !== 'Enter' && key !== ' ') return;
            event.preventDefault();
            this.selectArea(id, false);
          });
        });
      },
    }).addTo(this.map);

    const selected = this.shapes.has(this.selectedId()) ? this.selectedId() : '';
    this.selectArea(selected);
    this.updateStyles(this.coverageByArea(), selected);
  }

  private updateStyles(coverage: ReadonlyMap<string, AreaCoverage | null> | undefined, selected: string): void {
    for (const { properties } of this.areas()) {
      const id = properties.area_id;
      const shape = this.shapes.get(id);
      if (!shape) continue;

      const result = coverage?.get(id);
      const comparable = (result?.summary.monthsWithData ?? 0) > 0;
      const active = selected === id;
      const fill = comparable ? fills.covered : result === null ? fills.unavailable : fills.missing;
      const fillOpacity = properties.tipo === 'distrito' ? .52 : .22;
      shape.setStyle({
        color: active ? '#303722' : fill,
        weight: active ? 3 : 1.5,
        fillColor: fill,
        fillOpacity: active ? .62 : fillOpacity,
      });

      const status = comparable ? 'Con datos comparables' : result === null ? 'Consulta no disponible'
        : coverage ? 'Sin valor comparable' : 'Consultando cobertura';
      const label = document.createElement('span');
      label.textContent = properties.nombre_visible + ' · ' + status;
      shape.getElement()?.setAttribute('aria-label', label.textContent);
      shape.getElement()?.setAttribute('aria-pressed', String(active));
      shape.unbindTooltip().bindTooltip(label, { sticky: true });
    }
  }
}

