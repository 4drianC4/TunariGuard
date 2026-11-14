import type { NormalizedObservation } from './normalized-observation.js';

export interface DayRange {
  platform: string;
  /** Primer y último día UTC (YYYY-MM-DD) con dato estándar. */
  from: string;
  to: string;
}

/**
 * Acumula, por plataforma, el rango de días que cubre el dato ESTÁNDAR de un archivo (version
 * sin "NRT"). Sirve para borrar después las NRT provisionales de ese rango.
 */
export class StandardCoverage {
  private readonly ranges = new Map<string, DayRange>();

  add(observations: NormalizedObservation[]): void {
    for (const o of observations) {
      if (isNrt(o.productVersion)) continue;
      const day = o.acquiredAt.toISOString().slice(0, 10);
      const range = this.ranges.get(o.platform);
      if (!range) this.ranges.set(o.platform, { platform: o.platform, from: day, to: day });
      else {
        if (day < range.from) range.from = day;
        if (day > range.to) range.to = day;
      }
    }
  }

  toArray(): DayRange[] {
    return [...this.ranges.values()].sort((a, b) => a.platform.localeCompare(b.platform));
  }
}

export function isNrt(productVersion: string | null): boolean {
  return productVersion?.toUpperCase().includes('NRT') ?? false;
}
