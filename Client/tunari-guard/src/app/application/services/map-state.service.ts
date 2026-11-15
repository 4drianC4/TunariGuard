import { Injectable, signal } from '@angular/core';
import type * as L from 'leaflet';
import { MapEntitySelection } from '../../domain/models/map-entity-selection.model';
import { MapPeriod } from '../../domain/models/map-period.model';
import { DEFAULT_ARCHIVE_PERIOD } from '../../features/map/models/map-period.model';

/** Shared map context for the calendar and history feature contracts. */
@Injectable({ providedIn: 'root' })
export class MapStateService {
  readonly areaId = signal('parque-tunari');
  readonly period = signal<MapPeriod>({ ...DEFAULT_ARCHIVE_PERIOD });
  readonly selectedEntity = signal<MapEntitySelection | null>(null);
  readonly areaOfInterest = signal<ReturnType<L.Polygon['toGeoJSON']> | null>(null);

  setPeriod(period: MapPeriod): void {
    this.period.set({ ...period });
  }

  setSelectedEntity(selection: MapEntitySelection | null): void {
    this.selectedEntity.set(selection);
  }

  setAreaOfInterest(area: ReturnType<L.Polygon['toGeoJSON']> | null): void {
    this.areaOfInterest.set(area);
  }
}
