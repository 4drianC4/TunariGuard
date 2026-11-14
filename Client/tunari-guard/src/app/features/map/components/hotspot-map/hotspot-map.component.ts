import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LiveUpdatesService } from '../../../../application/services/live-updates.service';
import { CommonModule, registerLocaleData } from '@angular/common';
import localeEsBo from '@angular/common/locales/es-BO';
import * as L from 'leaflet';
import 'leaflet-draw';
import { MUNICIPAL_LAYERS } from '../../data-access/municipal-layers.config';
import { MapDataService } from '../../data-access/map-data.service';
import { MapExportService } from '../../data-access/map-export.service';
import { MunicipalCartographyService, MunicipalFeatureInfo } from '../../data-access/municipal-cartography.service';
import { MapDataSet, MapDataStatus } from '../../models/map-data.model';
import { MapEntitySelection } from '../../../../domain/models/map-entity-selection.model';
import { DEMO_MAP_PERIOD, MapPeriod } from '../../models/map-period.model';
import { Observation } from '../../models/observation.model';
import { DEFAULT_MAP_OBSERVATION_FILTERS, MapObservationFilters } from '../../models/map-observation-filters.model';
import { SensorType } from '../../../../domain/enums/sensor-type.enum';
import { MunicipalLayerControlComponent, MunicipalLayerControlItem } from '../municipal-layer-control/municipal-layer-control.component';
import { filterObservations } from '../../utils/map-observation-filter';
import { MapFiltersComponent } from '../map-filters/map-filters.component';
import { MapLayerSwitcherComponent } from '../map-layer-switcher/map-layer-switcher.component';
import { MapTimelineComponent } from '../map-timeline/map-timeline.component';
import { HotspotPopupComponent } from '../hotspot-popup/hotspot-popup.component';

registerLocaleData(localeEsBo);

@Component({
  selector: 'app-hotspot-map',
  standalone: true,
  imports: [CommonModule, MunicipalLayerControlComponent, MapFiltersComponent, MapLayerSwitcherComponent, MapTimelineComponent, HotspotPopupComponent],
  templateUrl: './hotspot-map.component.html',
  host: { class: 'block min-w-0 text-[#30351f]' }
})
export class HotspotMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly mapData = inject(MapDataService);
  private readonly destroyRef = inject(DestroyRef);
  readonly liveUpdates = inject(LiveUpdatesService);
  readonly replayTime = signal<string | null>(null);
  private readonly replayObservations = new Map<string, Observation>();

  constructor(
    private readonly municipalCartography: MunicipalCartographyService,
    private readonly mapExport: MapExportService,
  ) { }

  @ViewChild('mapContainer', { static: true }) private mapContainer!: ElementRef<HTMLDivElement>;

  /** Calendar contract: inclusive local-date range; this module has no period controls of its own. */
  @Input() areaId = 'parque-tunari';
  @Input() period: MapPeriod = { ...DEMO_MAP_PERIOD };

  /** Emits the selected map entity and drawn AOI for companion modules. */
  @Output() readonly selectionChange = new EventEmitter<MapEntitySelection | null>();
  @Output() readonly areaOfInterestChange = new EventEmitter<ReturnType<L.Polygon['toGeoJSON']> | null>();

  readonly SensorType = SensorType;
  readonly filtersOpen = signal(true);
  readonly dataSet = signal<MapDataSet>({ origin: this.mapData.origin, observations: [] });
  readonly dataStatus = signal<MapDataStatus>('loading');
  readonly dataError = signal<string | null>(null);
  readonly municipalLayersOpen = signal(true);
  readonly municipalFeatureInfo = signal<Array<{ name: string; result: MunicipalFeatureInfo }> | null>(null);
  readonly municipalFeatureInfoError = signal<string | null>(null);
  readonly legendFailures = signal<string[]>([]);
  readonly municipalLayerStates = signal<Record<string, 'idle' | 'loading' | 'ready' | 'error'>>({});
  readonly selectedArea = signal<L.Polygon | null>(null);
  private readonly areaRevision = signal(0);

  visibleSensors: SensorType[] = [SensorType.VIIRS, SensorType.MODIS];
  observationFilters: MapObservationFilters = { ...DEFAULT_MAP_OBSERVATION_FILTERS, platforms: [] };
  readonly selectedObservation = signal<Observation | null>(null);

  private map?: L.Map;
  private canvasRenderer?: L.Canvas;
  private readonly detectionLayer = L.layerGroup();
  private readonly replayLayer = L.layerGroup();
  private readonly drawnItems = L.featureGroup();
  private readonly municipalLayers = new Map<string, L.TileLayer.WMS>();
  private isDrawingArea = false;
  private loadSequence = 0;
  private loadAbortController?: AbortController;
  private loadDebounceTimer?: ReturnType<typeof setTimeout>;
  private liveRefreshPending = false;
  private areaRefreshFrame = 0;

  get filteredObservations(): Observation[] {
    return this.applyFilters(this.dataSet().observations);
  }

  private applyFilters(observations: readonly Observation[]): Observation[] {
    // Leaflet Draw mutates geometry objects in place; track a signal for view refreshes.
    this.areaRevision();
    const polygon = this.selectedArea();
    return filterObservations(observations, {
      period: this.period,
      showViirs: this.visibleSensors.includes(SensorType.VIIRS),
      showModis: this.visibleSensors.includes(SensorType.MODIS),
      ...this.observationFilters,
      includesArea: (observation) => !polygon || this.containsPoint(polygon, observation.position.lat, observation.position.lng),
    });
  }

  get municipalLayerControls(): MunicipalLayerControlItem[] {
    return MUNICIPAL_LAYERS.map((definition) => ({
      id: definition.id,
      name: definition.name,
      purpose: definition.purpose,
      visible: this.isMunicipalLayerVisible(definition.id),
      legendUrl: this.municipalCartography.createLegendUrl(definition.serviceId),
      status: this.municipalLayerStates()[definition.id] ?? 'idle',
      legendFailed: this.legendFailures().includes(definition.id)
    }));
  }

  get hasRightSidebarContent(): boolean {
    const hasMunicipalInfo = !!this.municipalFeatureInfo()?.some(
      (layer) => !!layer.result.features?.length
    );

    // TODO: incluir aquí los resultados analíticos cuando estén conectados.
    return this.selectedObservation() !== null ||
      hasMunicipalInfo ||
      !!this.municipalFeatureInfoError();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['period'] || changes['areaId']) void this.loadDetections();
    else this.renderDetections();
  }

  ngAfterViewInit(): void {
    // Start with the whole Cochabamba/Tunari analysis area in view so the first
    // backend bbox query includes detections outside the city center.
    this.map = L.map(this.mapContainer.nativeElement).setView([-17.25, -66.3], 9);
    this.map.zoomControl.setPosition('bottomleft');
    L.control.scale({ imperial: false, position: 'topright' }).addTo(this.map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);
    this.canvasRenderer = L.canvas({
      padding: 0.5,
      tolerance: 8
    });
    this.detectionLayer.addTo(this.map);
    this.replayLayer.addTo(this.map);
    this.drawnItems.addTo(this.map);
    this.initializeDrawing();
    this.map.on('click', (event: L.LeafletMouseEvent) => void this.queryMunicipalFeatureInfo(event));
    this.map.on('moveend', () => {
      if (!this.selectedArea()) this.scheduleDetectionReload();
    });
    this.renderDetections();
    if (this.liveUpdates.enabled) {
      this.liveUpdates.observationsChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.loadDebounceTimer) return;
        if (this.loadAbortController) this.liveRefreshPending = true;
        else void this.loadDetections(true);
      });
      this.liveUpdates.replay$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((frame) => {
        const time = frame?.simulatedTimeUtc ?? null;
        if (!time || time !== this.replayTime()) this.replayObservations.clear();
        this.replayTime.set(time);
        for (const { geometry, properties } of frame?.collection.features ?? []) {
          const [lng, lat] = geometry.coordinates;
          this.replayObservations.set(properties.id, { ...properties, position: { lat, lng } });
        }
        this.renderReplay();
      });
    }
    void this.loadDetections();
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  ngOnDestroy(): void {
    this.loadSequence++;
    if (this.loadDebounceTimer) clearTimeout(this.loadDebounceTimer);
    this.loadAbortController?.abort();
    if (this.areaRefreshFrame) cancelAnimationFrame(this.areaRefreshFrame);
    this.map?.off();
    this.map?.remove();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  onFilterChanges(changes: Partial<MapObservationFilters>): void {
    this.observationFilters = { ...this.observationFilters, ...changes };
    if ('minConfidence' in changes || 'platforms' in changes) this.scheduleDetectionReload();
    else this.renderDetections();
  }

  onSensorVisibilityChange(change: { sensor: SensorType; visible: boolean }): void {
    this.visibleSensors = change.visible
      ? [...new Set([...this.visibleSensors, change.sensor])]
      : this.visibleSensors.filter((sensor) => sensor !== change.sensor);
    this.renderDetections();
  }

  clearFilters(): void {
    this.visibleSensors = [SensorType.VIIRS, SensorType.MODIS];
    this.observationFilters = { ...DEFAULT_MAP_OBSERVATION_FILTERS, platforms: [] };
    this.scheduleDetectionReload();
  }

  clearSelection(): void {
    this.drawnItems.clearLayers();
    this.selectedArea.set(null);
    this.selectedObservation.set(null);
    this.selectionChange.emit(null);
    this.areaOfInterestChange.emit(null);
    this.scheduleDetectionReload();
  }

  exportSelectedArea(): void {
    const polygon = this.selectedArea();
    if (!polygon) return;
    this.mapExport.exportArea(polygon);
  }

  exportObservations(format: 'csv' | 'geojson'): void {
    this.mapExport.exportObservations(
      format,
      this.filteredObservations,
      this.dataSet().origin,
      this.period,
      this.currentFilterDescription(),
    );
  }

  selectObservation(observation: Observation | null): void {
    this.selectedObservation.set(observation);

    this.selectionChange.emit(
      observation ? { kind: 'observation', id: observation.id } : null
    );

    requestAnimationFrame(() => {
      this.map?.invalidateSize({ pan: false });
    });
  }

  setMunicipalLayer(id: string, visible: boolean): void {
    const definition = MUNICIPAL_LAYERS.find((item) => item.id === id);
    if (!definition || !this.map) return;
    let layer = this.municipalLayers.get(id);
    if (!layer) {
      layer = this.municipalCartography.createLayer(definition.serviceId);
      layer.on('loading', () => this.setMunicipalLayerState(id, 'loading'));
      layer.on('load', () => this.setMunicipalLayerState(id, 'ready'));
      layer.on('tileerror', () => this.setMunicipalLayerState(id, 'error'));
      this.municipalLayers.set(id, layer);
    }
    if (visible) {
      this.setMunicipalLayerState(id, 'loading');
      layer.addTo(this.map);
    } else {
      this.map.removeLayer(layer);
      if (this.municipalFeatureInfo()) this.municipalFeatureInfo.set(null);
    }
  }

  retryMunicipalLayer(id: string): void {
    this.legendFailures.update((ids) => ids.filter((failedId) => failedId !== id));
    const layer = this.municipalLayers.get(id);
    if (!layer || !this.map) return;
    this.setMunicipalLayerState(id, 'loading');
    if (!this.map.hasLayer(layer)) layer.addTo(this.map);
    else layer.redraw();
  }

  setMunicipalPanelOpen(open: boolean): void {
    this.municipalLayersOpen.set(open);
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  markLegendFailed(id: string): void {
    this.legendFailures.update((ids) => ids.includes(id) ? ids : [...ids, id]);
  }

  closeMunicipalInfo(): void {
    this.municipalFeatureInfo.set(null);
    this.municipalFeatureInfoError.set(null);
  }

  private async loadDetections(liveRefresh = false): Promise<void> {
    if (!this.map) return;
    if (this.loadDebounceTimer) {
      clearTimeout(this.loadDebounceTimer);
      this.loadDebounceTimer = undefined;
    }
    this.loadAbortController?.abort();
    this.liveRefreshPending = false;
    const abortController = new AbortController();
    this.loadAbortController = abortController;
    const sequence = ++this.loadSequence;
    this.dataStatus.set('loading');
    this.dataError.set(null);
    try {
      // Query the complete AOI envelope even when it extends beyond the viewport.
      // The exact polygon filter is still applied client-side below.
      const bounds = this.selectedArea()?.getBounds() ?? this.map.getBounds();
      const west = Math.max(-180, bounds.getWest());
      const east = Math.min(180, bounds.getEast());
      const south = Math.max(-90, bounds.getSouth());
      const north = Math.min(90, bounds.getNorth());
      const bbox = west <= east
        ? `${west},${south},${east},${north}`
        : `-180,${south},180,${north}`;
      const data = await this.mapData.loadObservations(this.period, {
        bbox,
        minConfidence: this.observationFilters.minConfidence,
        platforms: this.observationFilters.platforms,
      }, abortController.signal);
      if (sequence !== this.loadSequence) return;
      this.dataSet.set(data);
      const selected = this.selectedObservation();
      if (selected) {
        const updated = this.filteredObservations.find(({ id }) => id === selected.id);
        if (updated) this.selectedObservation.set(updated);
        else this.selectObservation(null);
      }
      this.dataStatus.set('ready');
      this.renderDetections();
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!liveRefresh) this.dataSet.set({ origin: this.mapData.origin, observations: [] });
      this.dataStatus.set('error');
      this.dataError.set(error instanceof Error ? error.message : 'No se pudieron cargar las detecciones.');
      this.renderDetections();
    } finally {
      if (sequence === this.loadSequence) {
        this.loadAbortController = undefined;
        if (this.liveRefreshPending && !this.loadDebounceTimer) void this.loadDetections(true);
      }
    }
  }

  private scheduleDetectionReload(): void {
    this.loadSequence++;
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

    this.detectionLayer.clearLayers();
    this.renderReplay();

    for (const observation of this.filteredObservations) {
      const fillColor =
        observation.sensor === SensorType.VIIRS
          ? '#DC2626'
          : '#2563EB';

      const marker = L.circleMarker([observation.position.lat, observation.position.lng], {
        renderer: this.canvasRenderer,
        radius: 8,
        color: '#F3E8D4',
        opacity: 0.95,
        weight: 2,
        fillColor,
        fillOpacity: 0.9,
        bubblingMouseEvents: false
      });

      marker.on('mouseover', () => {
        marker.setRadius(10);
        marker.setStyle({ weight: 3, fillOpacity: 1 });

        if (this.map) {
          this.map.getContainer().style.cursor = 'pointer';
        }
      });

      marker.on('mouseout', () => {
        marker.setRadius(8);
        marker.setStyle({ weight: 2, fillOpacity: 0.9 });

        if (this.map) {
          this.map.getContainer().style.cursor = '';
        }
      });

      marker.on('click', () => this.selectObservation(observation));
      marker.addTo(this.detectionLayer);
    }
  }

  private renderReplay(): void {
    this.replayLayer.clearLayers();
    if (!this.canvasRenderer) return;
    for (const { position } of this.applyFilters([...this.replayObservations.values()])) {
      L.circleMarker([position.lat, position.lng], {
        renderer: this.canvasRenderer,
        radius: 11,
        color: '#6d28d9',
        weight: 3,
        fill: false,
        interactive: false,
      }).addTo(this.replayLayer);
    }
  }

  private initializeDrawing(): void {
    if (!this.map) return;
    this.map.addControl(new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: { allowIntersection: false, showArea: true, shapeOptions: { color: '#526b24', weight: 3, fillOpacity: 0.14 } },
        rectangle: { shapeOptions: { color: '#526b24', weight: 3, fillOpacity: 0.14 } },
        polyline: false, circle: false, circlemarker: false, marker: false
      },
      edit: { featureGroup: this.drawnItems, edit: {}, remove: true }
    }));
    this.map.on('draw:drawstart draw:editstart draw:deletestart', () => this.isDrawingArea = true);
    this.map.on('draw:drawstop draw:editstop draw:deletestop', () => this.isDrawingArea = false);
    this.map.on(L.Draw.Event.CREATED, (event: L.LeafletEvent) => {
      const drawEvent = event as L.DrawEvents.Created;
      if (!(drawEvent.layer instanceof L.Polygon)) return;
      this.drawnItems.clearLayers();
      this.drawnItems.addLayer(drawEvent.layer);
      this.selectedArea.set(drawEvent.layer);
      this.areaRevision.update((revision) => revision + 1);
      this.selectedObservation.set(null);
      this.selectionChange.emit(null);
      this.emitAreaOfInterest();
      this.scheduleDetectionReload();
    });
    // Refresh while vertices or rectangle handles move, and once again when edits save.
    this.map.on('draw:editvertex draw:editmove draw:editresize draw:edited', () => {
      this.refreshAreaAfterEdit();
    });
    this.map.on('draw:edited', () => this.scheduleDetectionReload());
    this.map.on(L.Draw.Event.DELETED, () => {
      this.selectedArea.set(null);
      this.areaRevision.update((revision) => revision + 1);
      this.areaOfInterestChange.emit(null);
      this.scheduleDetectionReload();
    });
  }

  private refreshAreaAfterEdit(): void {
    if (this.areaRefreshFrame) return;
    this.areaRefreshFrame = requestAnimationFrame(() => {
      this.areaRefreshFrame = 0;
      this.areaRevision.update((revision) => revision + 1);
      this.emitAreaOfInterest();
      this.renderDetections();
    });
  }

  private emitAreaOfInterest(): void {
    const polygon = this.selectedArea();
    this.areaOfInterestChange.emit(polygon?.toGeoJSON() ?? null);
  }

  private containsPoint(polygon: L.Polygon, latitude: number, longitude: number): boolean {
    if (!this.map) return false;
    const point = this.map.latLngToLayerPoint(L.latLng(latitude, longitude));
    const polygons = this.normalizePolygonRings(polygon.getLatLngs());

    return polygons.some((rings) => {
      const [outerRing, ...holes] = rings;
      if (!outerRing || !this.isPointInRing(point, outerRing)) return false;
      return !holes.some((hole) => this.isPointInRing(point, hole));
    });
  }

  /** Normalize Leaflet's LatLng[], LatLng[][] and LatLng[][][] polygon forms. */
  private normalizePolygonRings(latlngs: L.LatLng[] | L.LatLng[][] | L.LatLng[][][]): L.LatLng[][][] {
    const isRing = (value: unknown): value is L.LatLng[] =>
      Array.isArray(value) && value.length > 0 && value.every((vertex) =>
        vertex instanceof L.LatLng || (
          typeof vertex === 'object' && vertex !== null &&
          'lat' in vertex && 'lng' in vertex
        ),
      );

    if (isRing(latlngs)) return [[latlngs]];
    const first = latlngs[0];
    if (isRing(first)) return [latlngs as L.LatLng[][]];
    return latlngs as L.LatLng[][][];
  }

  private isPointInRing(point: L.Point, ring: L.LatLng[]): boolean {
    if (!this.map || ring.length < 3) return false;
    const projected = ring.map((vertex) => this.map!.latLngToLayerPoint(vertex));
    let inside = false;
    for (let i = 0, j = projected.length - 1; i < projected.length; j = i++) {
      const a = projected[i], b = projected[j];
      const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
      const withinSegment = point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) &&
        point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
      if (Math.abs(cross) < 1e-8 && withinSegment) return true;
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  private async queryMunicipalFeatureInfo(event: L.LeafletMouseEvent): Promise<void> {
    this.municipalFeatureInfo.set(null);
    this.municipalFeatureInfoError.set(null);

    if (!this.map || this.isDrawingArea) return;
    const visible = MUNICIPAL_LAYERS.filter((definition) => this.isMunicipalLayerVisible(definition.id));
    if (!visible.length) return;
    this.municipalFeatureInfoError.set(null);

    const size = this.map.getSize();
    const bounds = this.map.getBounds();
    const southWest = L.CRS.EPSG3857.project(bounds.getSouthWest());
    const northEast = L.CRS.EPSG3857.project(bounds.getNorthEast());
    const bbox = `${southWest.x},${southWest.y},${northEast.x},${northEast.y}`;
    const x = Math.round(event.containerPoint.x);
    const y = Math.round(event.containerPoint.y);

    const requests = await Promise.allSettled(visible.map(async (definition) => ({
      name: definition.name,
      result: await this.municipalCartography.getFeatureInfo(
        definition.serviceId, bbox, size.x, size.y, x, y
      )
    })));

    const fulfilled = requests.flatMap((request) =>
      request.status === 'fulfilled' && request.value.result.features?.length
        ? [request.value]
        : []
    );

    const rejected = requests.some((request) => request.status === 'rejected');

    this.municipalFeatureInfo.set(fulfilled.length ? fulfilled : null);
    this.municipalFeatureInfoError.set(
      rejected
        ? 'No se pudo consultar GetFeatureInfo en una o más capas municipales.'
        : null
    );
  }

  private isMunicipalLayerVisible(id: string): boolean {
    const layer = this.municipalLayers.get(id);
    return !!layer && !!this.map?.hasLayer(layer);
  }

  private setMunicipalLayerState(id: string, state: 'idle' | 'loading' | 'ready' | 'error'): void {
    this.municipalLayerStates.update((current) => ({ ...current, [id]: state }));
  }

  private currentFilterDescription(): string {
    return JSON.stringify({
      query: {
        from: this.period.from,
        to: this.period.to,
        minConfidence: this.observationFilters.minConfidence || null,
      },
      clientFilters: {
        visibleSensors: this.visibleSensors,
        minFrpMw: this.observationFilters.minFrpMw,
        dayNight: this.observationFilters.dayNight || null,
        platforms: this.observationFilters.platforms,
        areaOfInterest: !!this.selectedArea(),
      },
    });
  }

}
