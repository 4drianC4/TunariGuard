import { Injectable } from '@angular/core';
import { MapPeriod } from '../../../domain/models/map-period.model';
import { MapDataOrigin, MapDataSet } from '../models/map-data.model';
import { ConfidenceLevel, Observation, ObservationFeatureProperties, SatellitePlatform } from '../models/observation.model';
import { MAP_API_BASE, MAP_DATA_ORIGIN } from './map-data.config';
import { MOCK_OBSERVATIONS } from './observations.mock';

interface ObservationFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: { type: 'Point'; coordinates: [number, number] };
    properties: ObservationFeatureProperties;
  }>;
  nextCursor: string | null;
}

export interface MapObservationQuery {
  bbox: string;
  minConfidence: '' | ConfidenceLevel;
  platforms: SatellitePlatform[];
  includeAllTypes: boolean;
}

@Injectable({ providedIn: 'root' })
export class MapDataService {
  get origin(): MapDataOrigin {
    return MAP_DATA_ORIGIN;
  }

  async observation(id: string, signal: AbortSignal): Promise<Observation> {
    const response = await fetch(`${MAP_API_BASE}/observations/${encodeURIComponent(id)}`, { signal });
    if (!response.ok) throw new Error(`No se pudo actualizar el detalle (HTTP ${response.status}).`);
    return response.json() as Promise<Observation>;
  }

  async loadObservations(period: MapPeriod, query: MapObservationQuery, signal: AbortSignal): Promise<MapDataSet> {
    if (MAP_DATA_ORIGIN === 'DEMO') {
      return {
        origin: 'DEMO',
        observations: MOCK_OBSERVATIONS.filter((observation) => {
          const date = this.localDate(observation.acquiredAtUtc);
          return date >= period.from && date <= period.to;
        }),
      };
    }

    const platforms = query.platforms.length ? query.platforms : [undefined];
    const results = await Promise.all(platforms.map((platform) =>
      this.loadPlatformObservations(period, query, platform, signal),
    ));

    return { origin: 'BACKEND', observations: results.flat() };
  }

  private async loadPlatformObservations(
    period: MapPeriod,
    query: MapObservationQuery,
    platform: SatellitePlatform | undefined,
    signal: AbortSignal,
  ): Promise<Observation[]> {
    const observations: Observation[] = [];
    let cursor: string | null = null;
    const seenCursors = new Set<string>();

    do {
      const params = new URLSearchParams({
        from: this.localDayBoundary(period.from, false),
        to: this.localDayBoundary(period.to, true),
        bbox: query.bbox,
        format: 'geojson',
        origin: 'REAL',
        limit: '1000',
        detectionType: query.includeAllTypes ? 'all' : 'vegetation',
      });
      if (query.minConfidence) params.set('minConfidence', query.minConfidence);
      if (platform) params.set('platform', platform);
      if (cursor) params.set('cursor', cursor);

      const response = await fetch(`${MAP_API_BASE}/observations?${params.toString()}`, { signal });
      if (!response.ok) throw new Error(`La API de observaciones respondió HTTP ${response.status}.`);

      const collection = await response.json() as ObservationFeatureCollection;
      if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
        throw new Error('La API devolvió una colección GeoJSON de observaciones no válida.');
      }
      observations.push(...collection.features.map((feature) => ({
        ...feature.properties,
        position: { lat: feature.geometry.coordinates[1], lng: feature.geometry.coordinates[0] },
      })));

      cursor = collection.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw new Error('La paginación de observaciones devolvió un cursor repetido.');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);

    return observations;
  }

  private localDate(acquiredAtUtc: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' }).format(new Date(acquiredAtUtc));
  }

  /** Calendar dates are inclusive in Bolivia local time; the API compares exact instants. */
  private localDayBoundary(date: string, endOfDay: boolean): string {
    return `${date}T${endOfDay ? '23:59:59.999' : '00:00:00'}-04:00`;
  }
}
