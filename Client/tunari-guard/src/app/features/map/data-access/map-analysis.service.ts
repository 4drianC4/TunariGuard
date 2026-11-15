import { LanguageService } from '../../../core/i18n/language.service';
import { inject, Injectable } from '@angular/core';
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { SensorType } from '../../../domain/enums/sensor-type.enum';
import type { MapPeriod } from '../models/map-period.model';
import type { Observation, SatellitePlatform } from '../models/observation.model';
import { MAP_API_BASE } from './map-data.config';

export interface AnalysisArea {
  area_id: string;
  nombre_visible: string;
  geometria: Geometry | null;
}
export type DistrictBoundaries = FeatureCollection<Polygon | MultiPolygon, {
  id: string; name: string; provisional: boolean;
  areaKm2: number | null; source: string | null; version: string | null;
}>;
export interface DistrictMonthlyActivity {
  unit: string;
  notice: string;
  records: { year: number; month: number; activityCount: number | null }[];
}

export interface DistrictTrend {
  serie: string;
  anios: string;
  n: number;
  tau_kendall: number | null;
  p_valor: number | null;
  pendiente_sen_por_anio: number | null;
  ic90_inferior: number | null;
  ic90_superior: number | null;
}

const sources: Record<SatellitePlatform, string> = {
  TERRA: 'MODIS-Terra', AQUA: 'MODIS-Aqua', SNPP: 'VIIRS-Suomi-NPP',
  NOAA20: 'VIIRS-NOAA-20', NOAA21: 'VIIRS-NOAA-21',
};
interface ArchiveDetection {
  id_deteccion: string;
  fuente: string;
  fecha_hora_utc: string;
  lat: number;
  lon: number;
  confianza_original: string | null;
  confianza_clase: string | null;
  frp_mw: number | null;
  dia_noche: string | null;
  distrito: string | null;
  distrito_area_id: string | null;
  fuente_persistente_probable: boolean;
  origen_dato: string;
  evento_id_tunari: string | null;
  evento_id_cbba: string | null;
}

@Injectable({ providedIn: 'root' })
export class MapAnalysisService {
  private readonly i18n = inject(LanguageService);
  areas(signal: AbortSignal) {
    return this.json<Omit<AnalysisArea, 'geometria'>[]>('/areas', signal);
  }

  area(id: string, signal: AbortSignal) {
    return this.json<AnalysisArea>(this.areaPath(id), signal);
  }

  districts(signal: AbortSignal): Promise<DistrictBoundaries> {
    return this.json('/districts?format=geojson', signal);
  }

  districtMonthlyActivity(id: string, signal: AbortSignal): Promise<DistrictMonthlyActivity> {
    const params = new URLSearchParams({ area_id: id, fuente: 'HARMONIZED' });
    return this.json('/historial?' + params, signal);
  }

  districtTrends(id: string, signal: AbortSignal): Promise<DistrictTrend[]> {
    return this.json(this.areaPath(id) + '/tendencias', signal);
  }

  async latestDetectionDate(id: string, signal: AbortSignal): Promise<string | undefined> {
    const params = new URLSearchParams({ area_id: id, limite: '1', orden: 'fecha_desc' });
    const [row] = await this.json<ArchiveDetection[]>('/detecciones?' + params, signal);
    return row && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' })
      .format(new Date(row.fecha_hora_utc));
  }

  async detections(
    id: string, period: MapPeriod, bbox: string | undefined, polygon: Geometry | undefined,
    platforms: SatellitePlatform[], confidence: string, exclude: boolean, signal: AbortSignal,
    onFirstPage?: (observations: Observation[]) => void,
  ): Promise<Observation[]> {
    const selectedSources = platforms.map((platform) => sources[platform]);
    const periodQuery = this.range(period);
    const observations: Observation[] = [];
    const append = (rows: ArchiveDetection[]) => {
      for (const row of rows) {
        if (exclude && row.fuente_persistente_probable) continue;
        const observation = toObservation(row);
        if (observation) observations.push(observation);
      }
    };
    if (polygon) {
      const matches = await this.json<ArchiveDetection[]>('/detecciones/buscar', signal, {
        poligono: polygon, ...periodQuery, fuentes: selectedSources.length ? selectedSources : undefined,
      });
      append(matches);
    } else {
      const params = new URLSearchParams({
        ...periodQuery, ...(id ? { area_id: id } : {}), ...(bbox ? { bbox } : {}), limite: onFirstPage ? '1000' : '10000',
        excluir_fuentes_persistentes: String(exclude),
      });
      if (confidence === 'HIGH') params.set('confianza_minima', 'alta');
      if (confidence === 'NOMINAL') params.set('confianza_minima', 'nominal');
      for (const source of selectedSources) params.append('fuente', source);
      let offset = 0;
      while (true) {
        params.set('offset', String(offset));
        const response = await this.request('/detecciones?' + params, signal);
        append(await response.json() as ArchiveDetection[]);
        const next = response.headers.get('X-Next-Offset');
        if (next === null) break;
        const nextOffset = Number(next);
        if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) throw new Error('Paginación de detecciones inválida.');
        if (offset === 0 && onFirstPage) {
          onFirstPage(observations.slice());
          params.set('limite', '10000');
        }
        offset = nextOffset;
      }
    }
    return observations;
  }

  private areaPath(id: string): string { return '/areas/' + encodeURIComponent(id); }
  private range(period: MapPeriod) { return { desde: period.from, hasta: period.to }; }

  private async json<T>(path: string, signal: AbortSignal, body?: object): Promise<T> {
    return (await this.request(path, signal, body)).json() as Promise<T>;
  }

  private async request(path: string, signal: AbortSignal, body?: object): Promise<Response> {
    const response = await this.i18n.fetch(MAP_API_BASE + path, {
      signal,
      ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      const message = typeof details?.message === 'string' ? details.message : 'HTTP ' + response.status;
      throw new Error(message);
    }
    return response;
  }
}

function toObservation(row: ArchiveDetection): Observation | null {
  const platform = (Object.keys(sources) as SatellitePlatform[]).find((key) => sources[key] === row.fuente);
  if (!platform || !row.fecha_hora_utc || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return null;
  const district = row.distrito_area_id
    ? { code: row.distrito_area_id, name: row.distrito ?? row.distrito_area_id, provisional: true } : null;
  return {
    id: row.id_deteccion,
    sensor: platform === 'TERRA' || platform === 'AQUA' ? SensorType.MODIS : SensorType.VIIRS,
    platform, position: { lat: row.lat, lng: row.lon }, acquiredAtUtc: row.fecha_hora_utc,
    confidenceRaw: row.confianza_original,
    confidenceLevel: row.confianza_clase === 'alta' ? 'HIGH' : row.confianza_clase === 'nominal' ? 'NOMINAL' : row.confianza_clase === 'baja' ? 'LOW' : null,
    dayNight: row.dia_noche === 'D' ? 'DAY' : row.dia_noche === 'N' ? 'NIGHT' : null,
    frpMw: row.frp_mw, brightnessKelvin: null, brightnessAuxKelvin: null,
    scan: null, track: null, productVersion: null,
    source: 'NASA_FIRMS', dataset: row.fuente, batchId: '',
    district, districtAssignment: district ? 'ASSIGNED' : null,
    archive: {
      origin: row.origen_dato,
      persistent: row.fuente_persistente_probable,
      events: [row.evento_id_tunari, row.evento_id_cbba].filter((event): event is string => !!event),
    },
  };
}
