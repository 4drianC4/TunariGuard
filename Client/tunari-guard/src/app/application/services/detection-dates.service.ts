import { Injectable, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

const boliviaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' });
const FIRST_SUPPORTED_DATE = '2000-01-01';
const dateLength = { day: 10, month: 7, year: 4 } as const;
export type DateUnit = keyof typeof dateLength;

function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

@Injectable({ providedIn: 'root' })
export class DetectionDatesService {
  private readonly first = signal(FIRST_SUPPORTED_DATE);
  private request?: Promise<string>;

  readonly firstDate = this.first.asReadonly();

  constructor() {
    void this.load();
  }

  get today(): string {
    return boliviaDate.format(new Date());
  }

  load(): Promise<string> {
    return this.request ??= this.fetchFirstDate();
  }

  min(unit: DateUnit = 'day'): string {
    return this.firstDate().slice(0, dateLength[unit]);
  }

  max(unit: DateUnit = 'day'): string {
    return this.today.slice(0, dateLength[unit]);
  }

  clamp(value: string, unit: DateUnit = 'day'): string {
    const min = this.min(unit);
    const max = this.max(unit);
    if (value < min) return min;
    return value > max ? max : value;
  }

  rangeError(from: string, to: string, unit: DateUnit = 'day'): string {
    if (!from && !to) return '';
    const min = this.min(unit);
    const max = this.max(unit);
    const suffix = unit === 'year' ? '-01-01' : unit === 'month' ? '-01' : '';
    if ([from, to].some((value) => value && (!isDate(value + suffix) || value < min || value > max))) {
      return `Selecciona un período entre ${min} y ${max}.`;
    }
    return from && to && from > to ? 'El inicio debe ser anterior o igual al fin.' : '';
  }

  private async fetchFirstDate(): Promise<string> {
    try {
      const base = environment.apiBaseUrl.replace(/\/$/, '');
      const params = new URLSearchParams({
        desde: FIRST_SUPPORTED_DATE, hasta: this.today, limite: '1', orden: 'fecha_asc',
      });
      const response = await fetch(base + '/detecciones?' + params, { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        const [first] = await response.json() as { fecha_bo: string }[];
        const date = first?.fecha_bo;
        if (date && isDate(date) && date >= FIRST_SUPPORTED_DATE && date <= this.today) this.first.set(date);
      }
    } catch {
      // Keep the supported lower bound when the archive is unavailable.
    }
    return this.first();
  }
}
