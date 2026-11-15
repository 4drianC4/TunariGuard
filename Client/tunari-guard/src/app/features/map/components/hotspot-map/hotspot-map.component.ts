import { addBoliviaBasemap, addOpenStreetMap } from '../../utils/map-basemap';
import { MapInfoComponent } from '../map-info.component';
import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LiveUpdatesService } from '../../../../application/services/live-updates.service';
import { CommonModule, registerLocaleData } from '@angular/common';
import type { Geometry } from 'geojson';
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
import { Observation, SatellitePlatform } from '../../models/observation.model';
import { DEFAULT_MAP_OBSERVATION_FILTERS, MapObservationFilters } from '../../models/map-observation-filters.model';
import { SensorType } from '../../../../domain/enums/sensor-type.enum';
import { MunicipalLayerControlComponent, MunicipalLayerControlItem } from '../municipal-layer-control/municipal-layer-control.component';
import { filterObservations } from '../../utils/map-observation-filter';
import { MapFiltersComponent } from '../map-filters/map-filters.component';
import { MapTimelineComponent } from '../map-timeline/map-timeline.component';
import { MapQueryControlsComponent } from '../map-query-controls/map-query-controls.component';
import { HotspotPopupComponent } from '../hotspot-popup/hotspot-popup.component';
import { MapAnalysisService, type AnalysisArea, type MapOverlay } from '../../data-access/map-analysis.service';

registerLocaleData(localeEsBo);

@Component({
  selector: 'app-hotspot-map',
  standalone: true,
  imports: [MapInfoComponent, CommonModule, MunicipalLayerControlComponent, MapFiltersComponent, MapTimelineComponent, HotspotPopupComponent, MapQueryControlsComponent],
  templateUrl: './hotspot-map.component.html',
  styleUrl: './hotspot-map.component.scss',
  host: { class: 'block min-w-0 text-[#30351f]' }
})
export class HotspotMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  private readonly mapData = inject(MapDataService);
  private readonly analysis = inject(MapAnalysisService);
  private readonly destroyRef = inject(DestroyRef);
  readonly liveUpdates = inject(LiveUpdatesService);
  readonly replayTime = signal<string | null>(null);
  readonly archive = signal(false);
  readonly backendEnabled = this.mapData.origin === 'BACKEND';
  readonly areas = signal<Omit<AnalysisArea, 'geometria'>[]>([]);
  readonly areaError = signal('');
  readonly boundaryError = signal('');
  readonly layerError = signal('');
  readonly polygon = signal<Geometry | undefined>(undefined);
  readonly overlayDetail = signal<{ layer: MapOverlay; title: string; fields: { key: string; label: string; value: string }[] } | null>(null);
  readonly municipalInfoLoading = signal(false);
  private municipalQuery = 0;
  private resizeObserver?: ResizeObserver;
  private resizingMap = false;
  readonly detailError = signal('');
  private detailRequest?: AbortController;
  readonly layerLabels: Record<MapOverlay, string> = {
    districts: 'Distritos operativos', recurrencia: 'Recurrencia histórica', 'puntos-calientes': 'Puntos calientes Gi*',
  };
  private readonly overlayFieldLabels: Record<string, string> = {
    area_id: 'Área de referencia',
    cell_id: 'Celda de 1 km',
    ranking: 'Posición por recurrencia',
    detecciones_total: 'Detecciones en la celda',
    dias_con_deteccion: 'Días con detecciones',
    primer_anio: 'Primer año con detecciones',
    ultimo_anio: 'Último año con detecciones',
    anios_con_fuego_2001_2025: 'Años con detecciones (2001–2025)',
    anios_con_fuego_viirs_2013_2025: 'Años con detecciones VIIRS (2013–2025)',
    anios_temporada_viirs_2013_2025: 'Años con detecciones VIIRS de julio a octubre',
    pct_anios_2001_2025: '% de años con detecciones (2001–2025)',
    pct_anios_viirs_2013_2025: '% de años con detecciones VIIRS (2013–2025)',
    clase_recurrencia_viirs: 'Nivel de recurrencia VIIRS',
    mes_pico: 'Mes con más detecciones (1–12)',
    unidad_principal: 'Municipio o distrito predominante',
    fuente_persistente_probable: 'Posible fuente fija de calor',
    celdas_dia_viirs_2013_2025: 'Días con detecciones VIIRS (2013–2025)',
    z_gi_estrella: 'Puntuación Z de Gi*',
    p_ajustado_bh: 'Valor p ajustado',
    punto_caliente: 'Concentración alta significativa',
    punto_frio: 'Concentración baja significativa',
    conglomerado: 'Grupo de celdas vecinas',
    name: 'Nombre',
    code: 'Código',
    provisional: 'Límite provisional',
  };
  readonly overlays: MapOverlay[] = ['districts', 'recurrencia', 'puntos-calientes'];
  readonly activeOverlays = signal<MapOverlay[]>([]);
  readonly excludePersistent = signal(false);
  readonly includeAllTypes = signal(false);
  private readonly lifetime = new AbortController();
  private areaRequest?: AbortController;
  private layerRequest?: AbortController;
  private readonly areaLayer = L.geoJSON(undefined, { style: { color: '#526b24', weight: 2, fill: false, interactive: false } });
  private readonly spatialLayers = L.layerGroup();
  private selectedAreaBoundary?: L.LatLngBounds;
  private readonly replayObservations = new Map<string, Observation>();

  constructor(
    private readonly municipalCartography: MunicipalCartographyService,
    private readonly mapExport: MapExportService,
  ) { }

  @ViewChild('mapContainer', { static: true }) private mapContainer!: ElementRef<HTMLDivElement>;

  /** Inclusive range of local calendar dates shared with the page. */
  @Input() compact = false;
  @Input() areaId = 'parque-tunari';
  @Input() period: MapPeriod = { ...DEMO_MAP_PERIOD };
  @Output() readonly contextChange = new EventEmitter<{ areaId: string; period: MapPeriod }>();

  /** Emits the selected map entity and drawn AOI for companion modules. */
  @Output() readonly selectionChange = new EventEmitter<MapEntitySelection | null>();
  @Output() readonly areaOfInterestChange = new EventEmitter<ReturnType<L.Polygon['toGeoJSON']> | null>();

  @ViewChild('detailPanel') private detailPanel?: ElementRef<HTMLElement>;

  readonly isModisPlatform = (platform: SatellitePlatform): boolean => platform === 'TERRA' || platform === 'AQUA';
  readonly isViirsPlatform = (platform: SatellitePlatform): boolean => !this.isModisPlatform(platform);
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

  get areaLabel(): string {
    if (!this.backendEnabled) return 'Parque Nacional Tunari y alrededores';
    if (!this.areaId) return 'Sin área de referencia';
    return this.areas().find((area) => area.area_id === this.areaId)?.nombre_visible ?? this.areaId;
  }

  get filteredObservations(): Observation[] {
    return this.applyFilters(this.dataSet().observations);
  }

  private applyFilters(observations: readonly Observation[]): Observation[] {
    // Leaflet Draw mutates geometry objects in place; track a signal for view refreshes.
    this.areaRevision();
    const polygon = this.selectedArea();
    return filterObservations(observations, {
      period: this.period,
      ...this.observationFilters,
      includesArea: (observation) => {
        const { lat, lng } = observation.position;
        return polygon ? this.containsPoint(polygon, lat, lng)
          : this.archive() || !this.areaLayer.getLayers().length || this.areaLayer.getLayers().some(
            (layer) => layer instanceof L.Polygon && this.containsPoint(layer, lat, lng),
          );
      },
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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['areaId'] && this.map && this.backendEnabled) {
      this.overlayDetail.set(null);
      if (!this.areaId) this.activeOverlays.update((layers) => layers.filter((layer) => layer === 'districts'));
      void this.loadArea();
      void this.loadOverlays();
    }
    if (changes['period'] || changes['areaId']) void this.loadDetections();
    else this.renderDetections();
  }

  ngAfterViewInit(): void {
    // Start with the whole Cochabamba/Tunari analysis area in view so the first
    // backend bbox query includes detections outside the city center.
    if (this.compact && this.backendEnabled) this.archive.set(true);
    this.map = L.map(this.mapContainer.nativeElement, { scrollWheelZoom: !this.compact }).setView([-17.25, -66.3], 9);
    this.resizeObserver = new ResizeObserver(() => {
      this.resizingMap = true;
      this.map?.invalidateSize({ pan: false });
      this.resizingMap = false;
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
    this.spatialLayers.addTo(this.map);
    this.replayLayer.addTo(this.map);
    this.drawnItems.addTo(this.map);
    if (!this.compact) this.initializeDrawing();
    this.map.on('click', (event: L.LeafletMouseEvent) => void this.queryMunicipalFeatureInfo(event));
    this.map.on('moveend', () => {
      if (!this.compact && !this.resizingMap && !this.selectedArea()) this.scheduleDetectionReload();
    });
    this.renderDetections();
    if (this.backendEnabled) {
      if (!this.compact) void this.loadAreaCatalog();
      void this.loadArea();
    }
    if (this.liveUpdates.enabled && !this.compact) {
      this.liveUpdates.observationsChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
        if (this.activeOverlays().includes('districts')) void this.loadOverlays();
        if (this.archive()) return;
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
    if (!this.compact || !this.backendEnabled) void this.loadDetections();
    requestAnimationFrame(() => this.map?.invalidateSize());
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.municipalQuery++;
    this.lifetime.abort();
    this.areaRequest?.abort();
    this.layerRequest?.abort();
    this.detailRequest?.abort();
    this.loadSequence++;
    if (this.loadDebounceTimer) clearTimeout(this.loadDebounceTimer);
    this.loadAbortController?.abort();
    if (this.areaRefreshFrame) cancelAnimationFrame(this.areaRefreshFrame);
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

  changeSource(archive: boolean): void {
    this.archive.set(archive);
    this.selectObservation(null);
    this.dataSet.set({ origin: archive ? 'ARCHIVE' : 'BACKEND', observations: [] });
    this.renderDetections();
    void this.loadDetections();
  }

  toggleOverlay(layer: MapOverlay, visible: boolean): void {
    if (!visible && this.overlayDetail()?.layer === layer) this.overlayDetail.set(null);
    this.activeOverlays.update((layers) => visible ? [...layers, layer] : layers.filter((item) => item !== layer));
    void this.loadOverlays();
  }

  togglePersistent(exclude: boolean): void {
    this.excludePersistent.set(exclude);
    if (this.archive()) this.scheduleDetectionReload();
    if (this.activeOverlays().includes('recurrencia')) void this.loadOverlays();
  }

  toggleDetectionTypes(includeAll: boolean): void {
    this.includeAllTypes.set(includeAll);
    this.scheduleDetectionReload();
  }

  async loadArea(): Promise<void> {
    this.areaRequest?.abort();
    const request = new AbortController();
    this.areaRequest = request;
    this.areaLayer.clearLayers();
    this.selectedAreaBoundary = undefined;
    this.boundaryError.set('');
    this.renderDetections();
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
      this.renderDetections();
    } catch (error) {
      if (!request.signal.aborted) this.boundaryError.set(this.errorMessage(error));
    } finally {
      if (this.compact && !request.signal.aborted) void this.loadDetections();
    }
  }

  zoomToArea(): void {
    if (this.selectedAreaBoundary) this.map?.fitBounds(this.selectedAreaBoundary);
  }

  async loadOverlays(): Promise<void> {
    this.layerRequest?.abort();
    const request = new AbortController();
    this.layerRequest = request;
    this.spatialLayers.clearLayers();
    this.layerError.set('');
    const colors = { districts: '#2563eb', recurrencia: '#a16207', 'puntos-calientes': '#be123c' };
    const layers = this.activeOverlays().filter((layer) => layer === 'districts' || this.areaId);
    const results = await Promise.allSettled(layers.map(async (layer) => {
      const data = await this.analysis.overlay(this.areaId, layer, this.excludePersistent(), request.signal);
      if (request.signal.aborted) return;
      const vector = L.geoJSON(data, {
        style: { color: colors[layer], weight: 2, fillOpacity: layer === 'districts' ? 0.04 : 0.24 },
        onEachFeature: (feature, item) => {
          item.on('click', (event: L.LeafletMouseEvent) => {
            if (this.isDrawingArea) return;
            L.DomEvent.stopPropagation(event);
            this.closeMunicipalInfo();
            const fields = Object.entries(feature.properties ?? {}).flatMap(([key, value]) =>
              value == null || typeof value === 'object' ? [] :
                [{
                  key,
                  label: this.overlayFieldLabels[key] ?? key.replaceAll('_', ' '),
                  value: this.formatOverlayValue(key, value),
                }],
            );
            this.overlayDetail.set({ layer, title: this.layerLabels[layer], fields });
          });
        },
      });
      vector.addTo(this.spatialLayers);
    }));
    if (request.signal.aborted) return;
    this.layerError.set(results.flatMap((result, index) => result.status === 'rejected'
      ? [this.layerLabels[layers[index]] + ': ' + this.errorMessage(result.reason)] : []).join(' · '));
  }

  private formatOverlayValue(key: string, value: unknown): string {
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    if (key === 'area_id') return this.areaLabel;
    if (key === 'clase_recurrencia_viirs') return String(value).replaceAll('_', ' ');
    return String(value);
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
    this.observationFilters = { ...this.observationFilters, ...changes };
    if ('minConfidence' in changes || 'platforms' in changes) this.scheduleDetectionReload();
    else this.renderDetections();
  }

  clearFilters(): void {
    this.observationFilters = { ...DEFAULT_MAP_OBSERVATION_FILTERS, platforms: [] };
    this.scheduleDetectionReload();
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
    this.mapExport.exportObservations(
      format,
      this.filteredObservations,
      this.dataSet().origin,
      this.period,
      this.currentFilterDescription(),
    );
  }

  selectObservation(observation: Observation | null): void {
    if (observation) {
      this.overlayDetail.set(null);
      this.closeMunicipalInfo();
    }
    this.detailRequest?.abort();
    this.detailError.set('');
    this.selectedObservation.set(observation);

    this.selectionChange.emit(
      observation ? { kind: 'observation', id: observation.id } : null
    );

    if (observation && this.dataSet().origin === 'BACKEND') void this.loadDetail(observation.id);
  }

  private async loadDetail(id: string): Promise<void> {
    const request = new AbortController();
    this.detailRequest = request;
    try {
      const observation = await this.mapData.observation(id, request.signal);
      if (!request.signal.aborted) this.selectedObservation.set(observation);
    } catch (error) {
      if (!request.signal.aborted) this.detailError.set(this.errorMessage(error));
    }
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
      this.closeMunicipalInfo();
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
    this.municipalQuery++;
    this.municipalInfoLoading.set(false);
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
      const bounds = this.selectedArea()?.getBounds()
        ?? (this.compact ? this.selectedAreaBoundary : undefined)
        ?? this.map.getBounds();
      const west = Math.max(-180, bounds.getWest());
      const east = Math.min(180, bounds.getEast());
      const south = Math.max(-90, bounds.getSouth());
      const north = Math.min(90, bounds.getNorth());
      const bbox = west <= east
        ? `${west},${south},${east},${north}`
        : `-180,${south},180,${north}`;
      const data: MapDataSet = this.archive() ? {
        origin: 'ARCHIVE',
        observations: await this.analysis.detections(
          this.areaId, this.period, bbox, this.polygon(), this.observationFilters.platforms,
          this.observationFilters.minConfidence, this.excludePersistent(), abortController.signal,
        ),
      } : await this.mapData.loadObservations(this.period, {
        bbox,
        minConfidence: this.observationFilters.minConfidence,
        platforms: this.observationFilters.platforms,
        includeAllTypes: this.includeAllTypes(),
      }, abortController.signal);
      if (sequence !== this.loadSequence) return;
      this.dataSet.set(data);
      const selected = this.selectedObservation();
      if (selected) {
        this.detailRequest?.abort();
        this.detailError.set('');
        const updated = this.filteredObservations.find(({ id }) => id === selected.id);
        if (updated && data.origin === 'BACKEND') this.selectObservation(updated);
        else if (updated) this.selectedObservation.set(updated);
        else this.selectObservation(null);
      }
      this.dataStatus.set('ready');
      this.renderDetections();
    } catch (error) {
      if (sequence !== this.loadSequence) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      if (!liveRefresh) this.dataSet.set({ origin: this.archive() ? 'ARCHIVE' : this.mapData.origin, observations: [] });
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

    const observations = this.filteredObservations;
    const selected = this.selectedObservation();
    if (selected && !observations.some(({ id }) => id === selected.id)) this.selectObservation(null);

    for (const observation of observations) {
      const fillColor =
        observation.sensor === SensorType.VIIRS
          ? '#DC2626'
          : '#2563EB';

      const marker = L.circleMarker([observation.position.lat, observation.position.lng], {
        renderer: this.canvasRenderer,
        pane: 'map-detections',
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

      marker.on('click', () => {
        if (!this.isDrawingArea) this.selectObservation(observation);
      });
      marker.addTo(this.detectionLayer);
    }
  }

  private renderReplay(): void {
    this.replayLayer.clearLayers();
    if (!this.canvasRenderer) return;
    for (const { position } of this.applyFilters([...this.replayObservations.values()])) {
      L.circleMarker([position.lat, position.lng], {
        renderer: this.canvasRenderer,
        pane: 'map-detections',
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
      this.areaRevision.update((revision) => revision + 1);
      this.selectObservation(null);
      this.emitAreaOfInterest();
      this.scheduleDetectionReload();
    });
    // Refresh while vertices or rectangle handles move, and once again when edits save.
    this.map.on('draw:editvertex draw:editmove draw:editresize draw:edited', () => {
      this.refreshAreaAfterEdit();
    });
    this.map.on('draw:edited', () => {
      this.emitAreaOfInterest();
      this.scheduleDetectionReload();
    });
    this.map.on(L.Draw.Event.DELETED, () => {
      this.selectedArea.set(null);
      this.polygon.set(undefined);
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
      this.renderDetections();
    });
  }

  private emitAreaOfInterest(): void {
    const polygon = this.selectedArea();
    this.polygon.set(polygon?.toGeoJSON().geometry);
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
    if (!this.map || this.isDrawingArea) return;
    const visible = MUNICIPAL_LAYERS.filter((definition) => this.isMunicipalLayerVisible(definition.id));
    if (!visible.length) return;
    this.overlayDetail.set(null);
    this.closeMunicipalInfo();
    const query = this.municipalQuery;
    this.municipalInfoLoading.set(true);

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

    if (query !== this.municipalQuery) return;
    this.municipalInfoLoading.set(false);
    this.municipalFeatureInfo.set(fulfilled);
    this.municipalFeatureInfoError.set(
      rejected
        ? 'No se pudo obtener información de una o más capas municipales.'
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
        areaId: this.areaId || null,
        excludePersistent: this.archive() && this.excludePersistent(),
        includeAllDetectionTypes: !this.archive() && this.includeAllTypes(),
        minFrpMw: this.observationFilters.minFrpMw,
        dayNight: this.observationFilters.dayNight || null,
        platforms: this.observationFilters.platforms,
        areaOfInterest: !!this.selectedArea(),
      },
    });
  }

}
