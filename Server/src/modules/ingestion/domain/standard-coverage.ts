import type { NormalizedObservation } from './normalized-observation.js';

export interface DayRange {
  platform: string;
  /** Primer y último día UTC (YYYY-MM-DD) con dato estándar. */
  from: string;
  to: string;
  /** Rectángulo que cubren las filas estándar de esa plataforma (WGS84, inclusive). */
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * Acumula, por plataforma, qué cubre el dato ESTÁNDAR de un archivo (version sin "NRT"): el
 * rango de días y el rectángulo de coordenadas. Sirve para borrar después solo las NRT
 * provisionales de esos días y de esa zona, no las de otras regiones.
 */
export class StandardCoverage {
  private readonly ranges = new Map<string, DayRange>();

  add(observations: NormalizedObservation[]): void {
    for (const o of observations) {
      if (isNrt(o.productVersion)) continue;
      const day = o.acquiredAt.toISOString().slice(0, 10);
      const range = this.ranges.get(o.platform);
      if (!range) {
        this.ranges.set(o.platform, {
          platform: o.platform,
          from: day,
          to: day,
          minLat: o.latitude,
          maxLat: o.latitude,
          minLon: o.longitude,
          maxLon: o.longitude,
        });
        continue;
      }
      if (day < range.from) range.from = day;
      if (day > range.to) range.to = day;
      range.minLat = Math.min(range.minLat, o.latitude);
      range.maxLat = Math.max(range.maxLat, o.latitude);
      range.minLon = Math.min(range.minLon, o.longitude);
      range.maxLon = Math.max(range.maxLon, o.longitude);
    }
  }

  toArray(): DayRange[] {
    return [...this.ranges.values()].sort((a, b) => a.platform.localeCompare(b.platform));
  }
}

export function isNrt(productVersion: string | null): boolean {
  return productVersion?.toUpperCase().includes('NRT') ?? false;
}
