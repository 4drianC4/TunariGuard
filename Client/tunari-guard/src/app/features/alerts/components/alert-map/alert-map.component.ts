import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, ViewChild, input, output } from '@angular/core';
import * as L from 'leaflet';
import { addOpenStreetMap } from '../../../map/utils/map-basemap';
import { ALERT_COLORS, SEVERITY_LEVEL, type AlertEvent } from '../../alert-event';

@Component({
  selector: 'app-alert-map',
  template: '<div #canvas class="map" aria-label="Mapa de alertas térmicas de la página actual"></div>',
  styles: '.map {height: clamp(290px, 44vh, 440px); isolation: isolate; border-radius: 12px; background: #e6e9df;}',
})
export class AlertMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly alerts = input.required<readonly AlertEvent[]>();
  readonly selected = input('');
  readonly focusRequest = input(0);
  readonly alertSelect = output<AlertEvent>();

  @ViewChild('canvas', { static: true }) private canvas!: ElementRef<HTMLDivElement>;
  private map?: L.Map;
  private resize?: ResizeObserver;
  private readonly layer = L.layerGroup();
  private readonly markers = new Map<string, L.Marker>();

  ngAfterViewInit(): void {
    this.map = L.map(this.canvas.nativeElement, { scrollWheelZoom: false }).setView([-17.35, -66.24], 10);
    addOpenStreetMap(this.map);
    L.control.scale({ imperial: false }).addTo(this.map);
    this.layer.addTo(this.map);
    this.resize = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
    this.resize.observe(this.canvas.nativeElement);
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['alerts'] || changes['selected']) this.render(!!changes['alerts']);
    if (changes['focusRequest'] && this.focusRequest()) {
      const marker = this.markers.get(this.selected());
      if (marker) this.map.setView(marker.getLatLng(), Math.max(this.map.getZoom(), 13));
    }
  }

  private render(fit = true): void {
    if (!this.map) return;
    this.layer.clearLayers();
    this.markers.clear();
    const bounds = L.latLngBounds([]);
    for (const alert of this.alerts()) {
      if (!Number.isFinite(alert.lat) || !Number.isFinite(alert.lng)) continue;
      const selected = alert.uuid === this.selected();
      const color = ALERT_COLORS[SEVERITY_LEVEL[alert.severity]];
      const size = selected ? 20 : 14;
      const dot = document.createElement('span');
      Object.assign(dot.style, { display: 'block', width: size + 'px', height: size + 'px', background: color,
        border: selected ? '3px solid #30351f' : '2px solid white', borderRadius: '50%', boxShadow: '0 1px 4px #0007' });
      const label = alert.id + ' · ' + alert.district + ' · ' + alert.severity;
      const tooltip = document.createElement('span');
      tooltip.textContent = label;
      const marker = L.marker([alert.lat, alert.lng], {
        title: label, alt: label, zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({ className: '', html: dot, iconSize: [size, size] }),
      }).addTo(this.layer);
      marker.bindTooltip(tooltip);
      marker.on('click', () => this.alertSelect.emit(alert));
      this.markers.set(alert.uuid, marker);
      bounds.extend(marker.getLatLng());
    }
    if (fit && bounds.isValid()) this.map.fitBounds(bounds, { padding: [32, 32], maxZoom: 13, animate: false });
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.map?.remove();
  }
}
