import { AfterViewInit, Component, ElementRef, OnChanges, OnDestroy, SimpleChanges, ViewChild, input, output } from '@angular/core';
import * as L from 'leaflet';
import type { DistrictBoundaries } from '../../../map/data-access/map-analysis.service';
import { addOpenStreetMap } from '../../../map/utils/map-basemap';
import { ACTIVITY, DistrictActivity } from '../../district-activity';

@Component({
  selector: 'app-district-map',
  templateUrl: './district-map.component.html',
  styleUrl: './district-map.component.scss',
})
export class DistrictMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly boundaries = input<DistrictBoundaries | null>(null);
  readonly districts = input.required<readonly DistrictActivity[]>();
  readonly selected = input('');
  readonly focusRequest = input(0);
  readonly districtSelect = output<string>();
  readonly levels = ACTIVITY;
  @ViewChild('mapContainer', { static: true }) private container!: ElementRef<HTMLDivElement>;
  private map?: L.Map;
  private layer?: L.GeoJSON;
  private resize?: ResizeObserver;
  private readonly shapes = new Map<string, L.Polygon>();

  ngAfterViewInit(): void {
    this.map = L.map(this.container.nativeElement, { scrollWheelZoom: false }).setView([-17.39, -66.17], 12);
    addOpenStreetMap(this.map);
    L.control.scale({ imperial: false }).addTo(this.map);
    this.rebuild();
    this.resize = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
    this.resize.observe(this.container.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['boundaries']) this.rebuild();
    else this.updateStyles();
    if (changes['focusRequest'] && this.focusRequest()) {
      const bounds = this.shapes.get(this.selected())?.getBounds();
      if (bounds?.isValid()) this.map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    }
  }

  ngOnDestroy(): void {
    this.resize?.disconnect();
    this.map?.remove();
  }

  resetZoom(): void {
    const bounds = this.layer?.getBounds();
    if (bounds?.isValid()) this.map?.fitBounds(bounds, { padding: [14, 14] });
  }

  private rebuild(): void {
    if (!this.map) return;
    this.layer?.remove();
    this.shapes.clear();
    this.layer = L.geoJSON(this.boundaries() ?? undefined, {
      onEachFeature: (feature, shape) => {
        if (!(shape instanceof L.Polygon)) return;
        const id = String(feature.properties.id);
        this.shapes.set(id, shape);
        const select = () => {
          if (this.districts().some((district) => district.id === id)) this.districtSelect.emit(id);
        };
        shape.on('click', select);
        shape.on('add', () => {
          shape.getElement()?.addEventListener('keydown', (event) => {
            const key = (event as KeyboardEvent).key;
            if (key !== 'Enter' && key !== ' ') return;
            event.preventDefault();
            select();
          });
        });
      },
    }).addTo(this.map);
    this.updateStyles();
    this.resetZoom();
  }

  private updateStyles(): void {
    const districts = new Map(this.districts().map((district) => [district.id, district]));
    for (const [id, shape] of this.shapes) {
      const district = districts.get(id);
      const selected = district && id === this.selected();
      shape.setStyle({
        color: selected ? '#30351f' : '#fff6da',
        weight: selected ? 3 : 1.5,
        fillColor: district?.color ?? '#bdb6aa',
        fillOpacity: district ? .62 : .14,
      });
      shape.unbindTooltip();
      const element = shape.getElement();
      element?.setAttribute('tabindex', district ? '0' : '-1');
      element?.setAttribute('role', 'button');
      element?.setAttribute('aria-disabled', String(!district));
      if (!district) continue;
      const label = document.createElement('span');
      label.textContent = `${district.name} · ${district.count} · ${district.risk}`;
      element?.setAttribute('aria-label', label.textContent);
      element?.setAttribute('aria-pressed', String(!!selected));
      shape.bindTooltip(label, selected ? { permanent: true, direction: 'center' } : { sticky: true });
      if (selected) shape.bringToFront();
    }
  }
}
