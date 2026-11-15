import { Injectable } from '@angular/core';
import { MAP_API_BASE } from '../../map/data-access/map-data.config';

const park = 'parque-tunari';

interface ArchiveDetection {
  id_deteccion: string;
  fecha_hora_utc: string;
  sensor: string;
  plataforma: string;
  confianza_clase: 'baja' | 'nominal' | 'alta' | null;
  origen_dato: string;
}

interface IndexMonth {
  mes: string;
  indice: number | null;
  era: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  async detections(signal: AbortSignal) {
    const params = new URLSearchParams({ area_id: park, limite: '4', orden: 'fecha_desc' });
    const response = await this.request('/detecciones?' + params, signal);
    const recent = await response.json() as ArchiveDetection[];
    const count = response.headers.get('X-Total-Count');
    return { recent, total: count === null ? null : Number(count) };
  }

  async districtCount(signal: AbortSignal) {
    const districts = await this.json<{ area_id: string }[]>('/areas?tipo=distrito', signal);
    return districts.length;
  }

  async coverage(signal: AbortSignal) {
    const [series, metadata] = await Promise.all([
      this.json<IndexMonth[]>('/areas/' + park + '/serie?escala=mensual', signal),
      this.json<{ parametros: { factor_viirs_por_modis?: string } }>('/metadatos', signal),
    ]);
    const factor = Number(metadata.parametros.factor_viirs_por_modis);
    const monthsWithIndex = series.filter(({ indice }) => indice !== null).length;
    return {
      factor: Number.isFinite(factor) && factor > 0 ? factor : null,
      start: series[0]?.mes.slice(0, 4),
      end: series.at(-1)?.mes.slice(0, 4),
      viirsStart: series.find(({ era }) => era.includes('VIIRS'))?.mes.slice(0, 4),
      months: series.length,
      monthsWithIndex,
      percentage: series.length ? monthsWithIndex / series.length : null,
    };
  }

  private async json<T>(path: string, signal: AbortSignal): Promise<T> {
    return (await this.request(path, signal)).json() as Promise<T>;
  }

  private async request(path: string, signal: AbortSignal): Promise<Response> {
    const response = await fetch(MAP_API_BASE + path, { signal });
    if (!response.ok) throw new Error(`La API respondió HTTP ${response.status}.`);
    return response;
  }
}
