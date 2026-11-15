import { addBoliviaBasemap, addOpenStreetMap } from '../../utils/map-basemap';
import { MapInfoComponent } from '../map-info.component';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, computed, inject, signal } from '@angular/core';
import type { MapDataStatus } from '../../models/map-data.model';
import { CommonModule, registerLocaleData } from '@angular/common';
import type { Geometry } from 'geojson';
import localeEsBo from '@angular/common/locales/es-BO';
import * as L from 'leaflet';
import 'leaflet-draw';
import { MapExportService } from '../../data-access/map-export.service';
import { MapEntitySelection } from '../../../../domain/models/map-entity-selection.model';
import { DEFAULT_ARCHIVE_PERIOD, MapPeriod } from '../../models/map-period.model';
import { Observation, SatellitePlatform } from '../../models/observation.model';
import { DEFAULT_MAP_OBSERVATION_FILTERS, MapObservationFilters } from '../../models/map-observation-filters.model';
import { SensorType } from '../../../../domain/enums/sensor-type.enum';
import { filterObservations } from '../../utils/map-observation-filter';
import { MapFiltersComponent } from '../map-filters/map-filters.component';
import { MapTimelineComponent } from '../map-timeline/map-timeline.component';
import { MapQueryControlsComponent } from '../map-query-controls/map-query-controls.component';
import { HotspotPopupComponent } from '../hotspot-popup/hotspot-popup.component';
import { MapAnalysisService, type AnalysisArea } from '../../data-access/map-analysis.service';

registerLocaleData(localeEsBo);

@Component({
  selector: 'app-hotspot-map',
  standalone: true,
  imports: [MapInfoComponent, CommonModule, MapFiltersComponent, MapTimelineComponent, HotspotPopupComponent, MapQueryControlsComponent],
  templateUrl: './hotspot-map.component.html',
  styleUrl: './hotspot-map.component.scss',
  host: { class: 'block min-w-0 text-[#30351f]' }
})
export class HotspotMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly mapExport = inject(MapExportService);
  private readonly analysis = inject(MapAnalysisService);
  readonly areas = signal<Omit<AnalysisArea, 'geometria'>[]>([]);
  readonly areaError = signal('');
  readonly boundaryError = signal('');
  private readonly polygon = signal<Geometry | undefined>(undefined);
  readonly excludePersistent = signal(false);
  private readonly lifetime = new AbortController();
  private resizeObserver?: ResizeObserver;
  private areaRequest?: AbortController;
  private readonly areaLayer = L.geoJSON(undefined, { style: { color: '#526b24', weight: 2, fill: false, interactive: false } });
  private selectedAreaBoundary?: L.LatLngBounds;
  @ViewChild('mapContainer', { static: true }) private mapContainer!: ElementRef<HTMLDivElement>;

  /** Inclusive range of local calendar dates shared with the page. */
  @Input() compact = false;
  @Input() areaId = 'parque-tunari';
  @Input() period: MapPeriod = { ...DEFAULT_ARCHIVE_PERIOD };
  @Output() readonly contextChange = new EventEmitter<{ areaId: string; period: MapPeriod }>();

  /** Emits the selected map entity and drawn AOI for companion modules. */
  @Output() readonly selectionChange = new EventEmitter<MapEntitySelection | null>();
  @Output() readonly areaOfInterestChange = new EventEmitter<ReturnType<L.Polygon['toGeoJSON']> | null>();

  @ViewChild('detailPanel') private detailPanel?: ElementRef<HTMLElement>;

  readonly isModisPlatform = (platform: SatellitePlatform): boolean => platform === 'TERRA' || platform === 'AQUA';
  readonly isViirsPlatform = (platform: SatellitePlatform): boolean => !this.isModisPlatform(platform);
  readonly filtersOpen = signal(true);
  readonly observations = signal<Observation[]>([]);
  readonly dataStatus = signal<MapDataStatus>('loading');
  readonly dataError = signal<string | null>(null);
  readonly selectedArea = signal<L.Polygon | null>(null);

  readonly observationFilters = signal<MapObservationFilters>(DEFAULT_MAP_OBSERVATION_FILTERS);
  readonly filteredObservations = computed(() => filterObservations(this.observations(), {
    ...this.observationFilters(),
    excludePersistent: this.excludePersistent(),
  }));
  readonly selectedObservation = signal<Observation | null>(null);

  private map?: L.Map;
  private canvasRenderer?: L.Canvas;
  private readonly detectionLayer = L.layerGroup();
  private readonly drawnItems = L.featureGroup();
  private readonly visibleMarkers = new Map<Observation, L.CircleMarker>();
  private renderFrame = 0;
  private isDrawingArea = false;
  private loadAbortController?: AbortController;
  private loadDebounceTimer?: ReturnType<typeof setTimeout>;

  get areaLabel(): string {
    if (!this.areaId) return 'Sin área de referencia';
    return this.areas().find((area) => area.area_id === this.areaId)?.nombre_visible ?? this.areaId;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['areaId']) void this.loadArea();
    if (changes['period'] || changes['areaId']) void this.loadDetections();
  }

  ngAfterViewInit(): void {
    // Start with the whole Cochabamba/Tunari analysis area in view so the first
    // backend bbox query includes detections outside the city center.
    this.map = L.map(this.mapContainer.nativeElement, { scrollWheelZoom: !this.compact }).setView([-17.25, -66.3], 9);
    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize({ pan: false });
    });
    this.resizeObserver.observe(this.mapContainer.nativeElement);
    L.control.scale({ imperial: false, position: 'topright' }).addTo(this.map);
    if (this.compact) addOpenStreetMap(this.map);
    else addBoliviaBasemap(this.map);
    this.map.createPane('map-detections').style.zIndex = '410';
    this.canvasRenderer = L.canvas({
      pane: 'map-detections',
      padding: 0.5,
      tolerance: 8
    });
    this.detectionLayer.addTo(this.map);
    this.areaLayer.addTo(this.map);
    this.drawnItems.addTo(this.map);
    if (!this.compact) this.initializeDrawing();
    this.map.on('moveend', () => {
      this.renderDetections();
      if (!this.areaId && !this.selectedArea()) this.scheduleDetectionReload();
    });
    if (!this.compact) void this.loadAreaCatalog();
    void this.loadArea();
    void this.loadDetections();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.renderFrame);
    this.lifetime.abort();
    this.areaRequest?.abort();
    if (this.loadDebounceTimer) clearTimeout(this.loadDebounceTimer);
    this.loadAbortController?.abort();
    this.map?.off();
    this.map?.remove();
  }

  async loadAreaCatalog(): Promise<void> {
    this.areaError.set('');
    try {
      this.areas.set(await this.analysis.areas(this.lifetime.signal));
    } catch (error) {
      if (!this.lifetime.signal.aborted) this.areaError.set(this.errorMessage(error));
    }
  }

  async loadArea(): Promise<void> {
    this.areaRequest?.abort();
    const request = new AbortController();
    this.areaRequest = request;
    this.areaLayer.clearLayers();
    this.selectedAreaBoundary = undefined;
    this.boundaryError.set('');
    if (!this.areaId) return;
    try {
      const area = await this.analysis.area(this.areaId, request.signal);
      if (request.signal.aborted || !area.geometria) return;
      this.areaLayer.addData(area.geometria);
      const bounds = this.areaLayer.getBounds();
      if (bounds.isValid()) {
        this.selectedAreaBoundary = bounds;
        if (this.compact) this.map?.fitBounds(bounds, { padding: [14, 14], animate: false });
      }
    } catch (error) {
      if (!request.signal.aborted) this.boundaryError.set(this.errorMessage(error));
    }
  }

  zoomToArea(): void {
    if (this.selectedAreaBoundary) this.map?.fitBounds(this.selectedAreaBoundary);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'No se pudo completar la consulta.';
  }

  focusDetectionDetail(): void {
    this.detailPanel?.nativeElement.focus();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  onFilterChanges(changes: Partial<MapObservationFilters>): void {
    this.observationFilters.update((filters) => ({ ...filters, ...changes }));
    this.renderDetections();
  }

  clearFilters(): void {
    this.observationFilters.set(DEFAULT_MAP_OBSERVATION_FILTERS);
    this.excludePersistent.set(false);
    this.renderDetections();
  }

  togglePersistent(exclude: boolean): void {
    this.excludePersistent.set(exclude);
    this.renderDetections();
  }

  clearSelection(): void {
    this.drawnItems.clearLayers();
    this.selectedArea.set(null);
    this.polygon.set(undefined);
    this.selectObservation(null);
    this.areaOfInterestChange.emit(null);
    this.scheduleDetectionReload();
  }

  exportSelectedArea(): void {
    const polygon = this.selectedArea();
    if (!polygon) return;
    this.mapExport.exportArea(polygon);
  }

  exportObservations(format: 'csv' | 'geojson'): void {
    this.mapExport.exportObservations(format, this.filteredObservations(), this.period, this.currentFilterDescription());
  }

  selectObservation(observation: Observation | null): void {
    this.selectedObservation.set(observation);
    this.selectionChange.emit(observation ? { kind: 'observation', id: observation.id } : null);
  }

  async loadDetections(): Promise<void> {
    if (!this.map) return;
    if (this.loadDebounceTimer) clearTimeout(this.loadDebounceTimer);
    this.loadDebounceTimer = undefined;
    this.loadAbortController?.abort();
    const request = new AbortController();
    this.loadAbortController = request;
    this.dataStatus.set('loading');
    this.dataError.set(null);
    this.observations.set([]);
    if (this.selectedObservation()) this.selectObservation(null);
    this.renderDetections();

    const bounds = this.map.getBounds();
    const bbox = this.areaId ? undefined : [
      Math.max(-180, bounds.getWest()), Math.max(-90, bounds.getSouth()),
      Math.min(180, bounds.getEast()), Math.min(90, bounds.getNorth()),
    ].join(',');

    try {
      const observations = await this.analysis.detections(
        this.areaId, this.period, bbox, this.polygon(), [], '', false, request.signal,
        (firstPage) => {
          if (request.signal.aborted) return;
          this.observations.set(firstPage);
          this.renderDetections();
        },
      );
      if (request.signal.aborted) return;
      this.observations.set(observations);
      this.dataStatus.set('ready');
      this.renderDetections();
    } catch (error) {
      if (request.signal.aborted) return;
      this.observations.set([]);
      this.dataStatus.set('error');
      this.dataError.set(this.errorMessage(error));
      this.renderDetections();
    } finally {
      if (this.loadAbortController === request) this.loadAbortController = undefined;
    }
  }

  private scheduleDetectionReload(): void {
    this.loadAbortController?.abort();
    this.loadAbortController = undefined;
    if (this.loadDebounceTimer) clearTimeout(this.loadDebounceTimer);
    this.loadDebounceTimer = setTimeout(() => {
      this.loadDebounceTimer = undefined;
      void this.loadDetections();
    }, 250);
  }

  private renderDetections(): void {
    if (!this.map || !this.canvasRenderer) return;
    const bounds = this.map.getBounds().pad(0.1);
    const renderer = this.canvasRenderer;
    const observations = this.filteredObservations();
    const selected = this.selectedObservation();
    if (selected && !observations.includes(selected)) this.selectObservation(null);

    const visible = new Set(observations.filter(({ position }) => bounds.contains([position.lat, position.lng])));
    for (const [observation, marker] of this.visibleMarkers) {
      if (visible.has(observation)) continue;
      this.detectionLayer.removeLayer(marker);
      this.visibleMarkers.delete(observation);
    }

    cancelAnimationFrame(this.renderFrame);
    const pending = [...visible].filter((observation) => !this.visibleMarkers.has(observation));
    let offset = 0;
    const drawBatch = () => {
      const end = Math.min(offset + 300, pending.length);
      for (; offset < end; offset++) {
        const observation = pending[offset];
        const marker = L.circleMarker([observation.position.lat, observation.position.lng], {
          renderer,
          pane: 'map-detections',
          radius: 6,
          color: '#F3E8D4',
          weight: 1,
          fillColor: observation.sensor === SensorType.VIIRS ? '#DC2626' : '#2563EB',
          fillOpacity: 0.9,
          bubblingMouseEvents: false,
        });
        marker.on('click', () => {
          if (!this.isDrawingArea) this.selectObservation(observation);
        });
        this.visibleMarkers.set(observation, marker);
        marker.addTo(this.detectionLayer);
      }
      if (offset < pending.length) this.renderFrame = requestAnimationFrame(drawBatch);
    };
    if (pending.length) this.renderFrame = requestAnimationFrame(drawBatch);
  }

  private initializeDrawing(): void {
    if (!this.map) return;
    this.map.addControl(new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#526b24', weight: 3, fillOpacity: 0.14, className: 'map-drawn-area' } },
        rectangle: { shapeOptions: { color: '#526b24', weight: 3, fillOpacity: 0.14, className: 'map-drawn-area' } },
        polyline: false, circle: false, circlemarker: false, marker: false
      },
      edit: { featureGroup: this.drawnItems, edit: {}, remove: true }
    }));
    this.map.on('draw:drawstart draw:editstart draw:deletestart', () => {
      this.isDrawingArea = true;
      this.mapContainer.nativeElement.classList.add('map-drawing');
    });
    this.map.on('draw:drawstop draw:editstop draw:deletestop', () => {
      this.isDrawingArea = false;
      this.mapContainer.nativeElement.classList.remove('map-drawing');
    });
    this.map.on(L.Draw.Event.CREATED, (event: L.LeafletEvent) => {
      const drawEvent = event as L.DrawEvents.Created;
      if (!(drawEvent.layer instanceof L.Polygon)) return;
      this.drawnItems.clearLayers();
      this.drawnItems.addLayer(drawEvent.layer);
      this.selectedArea.set(drawEvent.layer);
      this.emitAreaOfInterest();
      this.scheduleDetectionReload();
    });
    this.map.on('draw:edited', () => {
      this.emitAreaOfInterest();
      this.scheduleDetectionReload();
    });
    this.map.on(L.Draw.Event.DELETED, () => {
      this.selectedArea.set(null);
      this.polygon.set(undefined);
      this.areaOfInterestChange.emit(null);
      this.scheduleDetectionReload();
    });
  }

  private emitAreaOfInterest(): void {
    const polygon = this.selectedArea();
    const feature = polygon?.toGeoJSON();
    this.polygon.set(feature?.geometry);
    this.areaOfInterestChange.emit(feature ?? null);
  }

  private currentFilterDescription(): string {
    return JSON.stringify({
      query: {
        from: this.period.from,
        to: this.period.to,
        minConfidence: this.observationFilters().minConfidence || null,
      },
      clientFilters: {
        areaId: this.areaId || null,
        excludePersistent: this.excludePersistent(),
        minFrpMw: this.observationFilters().minFrpMw,
        dayNight: this.observationFilters().dayNight || null,
        platforms: this.observationFilters().platforms,
        areaOfInterest: !!this.selectedArea(),
      },
    });
  }

}
