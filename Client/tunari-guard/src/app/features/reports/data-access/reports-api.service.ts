import { LanguageService } from '../../../core/i18n/language.service';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';

export type ReportSource = 'HARMONIZED' | 'MODIS' | 'VIIRS';
export type ReportKind = 'detections' | 'alerts' | 'districts' | 'history' | 'comparison';

export interface ReportFilters {
  kind: ReportKind;
  area: string;
  from: string;
  to: string;
  source: ReportSource | 'ALL';
  confidence: string;
  alertLevel: string;
}

export interface ReportArea {
  area_id: string;
  nombre_visible: string;
  metodo_indice: 'mixto_calibrado' | 'viirs_reescalado' | null;
}

interface Detection {
  id_deteccion: string;
  fecha_bo: string;
  fecha_hora_utc: string;
  fecha_hora_bo: string | null;
  sensor: string | null;
  plataforma: string | null;
  dia_noche: string | null;
  fuente: string;
  distrito: string | null;
  confianza_clase: string | null;
  origen_dato: string;
  frp_mw: number | null;
  lat: number;
  lon: number;
}

interface Alert {
  mes: string;
  nivel_alerta: string;
  base_alertas: string;
  probabilidad_exceso: number | null;
  categoria_alerta: string | null;
  celdas_dia_base: number | null;
  esperado_modelo: number | null;
  lectura_modelo: string | null;
}

interface HistoryMonth {
  year: number;
  month: number;
  activityCount: number | null;
  provisional?: boolean;
  quality?: string | null;
}

interface History {
  unit: string;
  notice: string;
  records: HistoryMonth[];
}

interface DistrictHistory extends Omit<History, 'records'> {
  districts: { nombre_visible: string; records: HistoryMonth[] }[];
}

export type ReportValue = string | number | null;

export interface ReportData {
  columns: string[];
  rows: ReportValue[][];
  notice: string;
  headline: { label: string; value: number | null; unit: string };
  detections?: Detection[];
}

const satelliteSources = {
  MODIS: ['MODIS-Terra', 'MODIS-Aqua'],
  VIIRS: ['VIIRS-Suomi-NPP', 'VIIRS-NOAA-20', 'VIIRS-NOAA-21'],
};

const monthOf = (record: HistoryMonth): string =>
  `${record.year}-${String(record.month).padStart(2, '0')}`;

function monthsInRange(records: HistoryMonth[], filters: ReportFilters): HistoryMonth[] {
  return records.filter((record) => {
    const month = monthOf(record);
    return month >= filters.from && month <= filters.to;
  });
}

function totalOf(records: HistoryMonth[]): number | null {
  const values = records.flatMap((record) => record.activityCount === null ? [] : [record.activityCount]);
  return values.length ? Number(values.reduce((total, value) => total + value, 0).toFixed(2)) : null;
}

@Injectable({ providedIn: 'root' })
export class ReportsApiService {
  private readonly i18n = inject(LanguageService);
  areas(signal: AbortSignal): Promise<ReportArea[]> {
    return this.json('/areas', signal);
  }

  async coverage(signal: AbortSignal): Promise<string> {
    const metadata = await this.json<{ parametros: { cobertura_hasta: string } }>('/metadatos', signal);
    return metadata.parametros.cobertura_hasta;
  }

  load(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    switch (filters.kind) {
      case 'detections': return this.detections(filters, signal);
      case 'alerts': return this.alerts(filters, signal);
      case 'districts': return this.districts(filters, signal);
      case 'comparison': return this.comparison(filters, signal);
      case 'history': return this.history(filters, signal);
    }
  }

  private async detections(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    const params = new URLSearchParams({
      area_id: filters.area, desde: filters.from, hasta: filters.to, limite: '10000', orden: 'fecha_desc',
    });
    if (filters.source === 'MODIS' || filters.source === 'VIIRS') {
      for (const source of satelliteSources[filters.source]) params.append('fuente', source);
    }
    if (filters.confidence) params.set('confianza_minima', filters.confidence);

    const detections: Detection[] = [];
    let offset = 0;
    let total: number | undefined;
    while (true) {
      params.set('offset', String(offset));
      const response = await this.request('/detecciones?' + params, signal);
      const count = response.headers.get('X-Total-Count');
      if (count !== null) total ??= Number(count);
      const batch = await response.json() as Detection[];
      detections.push(...batch);
      const next = response.headers.get('X-Next-Offset');
      if (next === null) break;
      const nextOffset = Number(next);
      if (!Number.isSafeInteger(nextOffset) || nextOffset <= offset) {
        throw new Error('La API devolvió una página de detecciones inválida.');
      }
      offset = nextOffset;
    }
    if (total !== undefined && total !== detections.length) {
      throw new Error('El total cambió durante la consulta. Actualiza el reporte para cargar todas las filas.');
    }
    return {
      columns: ['ID', 'Fecha local', 'Hora local', 'Fecha y hora UTC', 'Sensor', 'Fuente', 'Plataforma',
        'Distrito', 'Confianza', 'FRP (MW)', 'Latitud', 'Longitud', 'Día / noche', 'Origen'],
      rows: detections.map((d) => [
        d.id_deteccion, d.fecha_bo, d.fecha_hora_bo?.slice(11, 19) ?? null, d.fecha_hora_utc,
        d.sensor, d.fuente, d.plataforma, d.distrito, d.confianza_clase,
        d.frp_mw, d.lat, d.lon, d.dia_noche === 'D' ? 'Día' : d.dia_noche === 'N' ? 'Noche' : null,
        d.origen_dato?.toLowerCase() === 'nrt' ? 'NRT (provisional)' : d.origen_dato,
      ]),
      headline: { label: 'Detecciones térmicas', value: detections.length, unit: 'detecciones' },
      notice: 'Fuente NASA FIRMS, archivo analizado del esquema fuego. Una detección térmica no confirma un incendio. Los registros NRT son provisionales.',
      detections,
    };
  }

  private async alerts(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    const lastDay = new Date(Date.UTC(Number(filters.to.slice(0, 4)), Number(filters.to.slice(5)), 0)).getUTCDate();
    const params = new URLSearchParams({
      desde: filters.from + '-01',
      hasta: filters.to + '-' + lastDay,
      solo_destacadas: 'true',
      limite: '10000',
    });
    if (filters.alertLevel) params.set('nivel', filters.alertLevel);
    const alerts = await this.json<Alert[]>(`/areas/${encodeURIComponent(filters.area)}/alertas?${params}`, signal);
    return {
      columns: ['Mes', 'Nivel de alerta', 'Categoría', 'Base del modelo', 'Celdas-día observadas', 'Esperado por el modelo', 'Probabilidad de un mes igual o mayor (%)', 'Interpretación'],
      rows: alerts.map((a) => [
        a.mes.slice(0, 7), a.nivel_alerta.replaceAll('_', ' '), a.categoria_alerta, a.base_alertas, a.celdas_dia_base, a.esperado_modelo,
        a.probabilidad_exceso === null ? null : Number((100 * a.probabilidad_exceso).toFixed(4)),
        a.lectura_modelo,
      ]),
      headline: { label: 'Meses con alerta', value: alerts.filter((a) => a.nivel_alerta !== 'normal').length, unit: 'meses' },
      notice: 'Alertas estadísticas del esquema fuego. La probabilidad se refiere al nivel de actividad mensual según el modelo.',
    };
  }

  private async history(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    const result = await this.areaHistory(filters, filters.source === 'ALL' ? 'HARMONIZED' : filters.source, signal);
    const months = monthsInRange(result.records, filters);
    return {
      columns: ['Mes', result.unit, 'Calidad o estado'],
      rows: months.map((m) => [monthOf(m), m.activityCount, m.quality ?? (m.provisional ? 'Provisional (NRT)' : null)]),
      headline: { label: 'Actividad acumulada', value: totalOf(months), unit: result.unit },
      notice: result.notice,
    };
  }

  private async districts(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    const params = this.historyParams(filters, filters.source === 'ALL' ? 'HARMONIZED' : filters.source);
    const result = await this.json<DistrictHistory>('/historial/distritos?' + params, signal);
    const districts = result.districts.map((d) => {
      const months = monthsInRange(d.records, filters);
      return { name: d.nombre_visible, total: totalOf(months), covered: months.filter((m) => m.activityCount !== null).length };
    }).sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity) || a.name.localeCompare(b.name, 'es'));
    return {
      columns: ['Distrito', result.unit, 'Meses con valor comparable'],
      rows: districts.map((d) => [d.name, d.total, d.covered]),
      headline: { label: 'Distritos con actividad', value: districts.filter((d) => (d.total ?? 0) > 0).length, unit: 'distritos' },
      notice: result.notice,
    };
  }

  private async comparison(filters: ReportFilters, signal: AbortSignal): Promise<ReportData> {
    const [modis, viirs] = await Promise.all([
      this.areaHistory(filters, 'MODIS', signal),
      this.areaHistory(filters, 'VIIRS', signal),
    ]);
    const series = [modis, viirs].map(({ records }) => new Map(
      monthsInRange(records, filters).map((m) => [monthOf(m), m.activityCount]),
    ));
    const [modisMonths, viirsMonths] = series;
    const months = [...new Set([...modisMonths.keys(), ...viirsMonths.keys()])].sort();
    const comparable = months.filter((month) => modisMonths.get(month) != null && viirsMonths.get(month) != null);
    return {
      columns: ['Mes', 'MODIS (celdas-día)', 'VIIRS (celdas-día)'],
      rows: months.map((month) => [month, modisMonths.get(month) ?? null, viirsMonths.get(month) ?? null]),
      headline: { label: 'Meses con datos de ambos sensores', value: comparable.length, unit: 'meses' },
      notice: modis.notice,
    };
  }

  private areaHistory(filters: ReportFilters, source: ReportSource, signal: AbortSignal): Promise<History> {
    const params = this.historyParams(filters, source);
    params.set('area_id', filters.area);
    return this.json('/historial?' + params, signal);
  }

  private historyParams(filters: ReportFilters, source: ReportSource): URLSearchParams {
    return new URLSearchParams({
      fuente: source, medida: 'celdas_dia', desde_anio: filters.from.slice(0, 4), hasta_anio: filters.to.slice(0, 4),
    });
  }

  private async json<T>(path: string, signal: AbortSignal): Promise<T> {
    return (await this.request(path, signal)).json() as Promise<T>;
  }

  private async request(path: string, signal: AbortSignal): Promise<Response> {
    const response = await this.i18n.fetch(environment.apiBaseUrl + path, { signal });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      const message = typeof details?.message === 'string' ? details.message : `HTTP ${response.status}`;
      throw new Error(message);
    }
    return response;
  }
}
