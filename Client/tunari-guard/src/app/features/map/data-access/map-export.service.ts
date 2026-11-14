import { Injectable } from '@angular/core';
import * as L from 'leaflet';
import { Observation } from '../models/observation.model';
import { MapDataOrigin } from '../models/map-data.model';
import { MapPeriod } from '../../../domain/models/map-period.model';

@Injectable({ providedIn: 'root' })
export class MapExportService {
  exportArea(polygon: L.Polygon): void {
    const feature = polygon.toGeoJSON();
    feature.properties = { name: 'Área de interés - Tunari Guard', type: 'AOI' };
    this.download('area-de-interes.geojson', JSON.stringify(feature, null, 2), 'application/geo+json');
  }

  exportObservations(
    format: 'csv' | 'geojson',
    observations: readonly Observation[],
    origin: MapDataOrigin,
    period: MapPeriod,
    filters: string,
  ): void {
    if (format === 'csv') {
      const metadata = {
        data_origin: origin,
        period_from: period.from,
        period_to: period.to,
        filters_applied: filters,
        warning: 'Una detección satelital no es un incendio confirmado.',
      };
      const keys = [...new Set([...Object.keys(metadata), ...observations.flatMap((item) => Object.keys(item))])];
      const rows = [
        keys.join(','),
        ...observations.map((item) => {
          const values = { ...metadata, ...item };
          return keys.map((key) => this.csvValue(values[key as keyof typeof values])).join(',');
        }),
      ];
      this.download('detecciones-filtradas.csv', rows.join('\n'), 'text/csv;charset=utf-8');
      return;
    }

    const collection = {
      type: 'FeatureCollection',
      properties: {
        data_origin: origin,
        period,
        filters,
        warning: 'DEMO contiene registros ficticios; una detección satelital no es un incendio confirmado.',
      },
      features: observations.map((item) => {
        const { position, ...properties } = item;
        return {
        type: 'Feature',
        id: item.id,
        geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
        properties,
      }; }),
    };
    this.download('detecciones-filtradas.geojson', JSON.stringify(collection, null, 2), 'application/geo+json');
  }

  private csvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  }

  private download(filename: string, text: string, mimeType: string): void {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
