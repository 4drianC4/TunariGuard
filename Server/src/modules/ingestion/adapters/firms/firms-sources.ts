import { parse } from 'csv-parse/sync';

/** [oeste, sur, este, norte] en WGS84. */
export type Bbox = [number, number, number, number];

/**
 * Rectángulo del Parque Tunari y el municipio de Cochabamba con 0,02° de margen, el mismo que usó
 * el equipo de datos. Se usa si el esquema fuego no está cargado (con fuego se calcula de las áreas).
 */
export const DEFAULT_BBOX: Bbox = [-66.7556, -17.5763, -65.886, -16.8838];

export interface FirmsSource {
  id: string;
  label: string;
  sensor: 'MODIS' | 'VIIRS';
  /** Producto en la API por área (con FIRMS_MAP_KEY). */
  apiSource: string;
  /** Archivo público de las últimas 24 h para Sudamérica (sin clave). */
  publicPath: string;
}

/** Satélites con datos casi en tiempo real (NRT). Suomi-NPP dejó de entregar datos en nov-2026. */
export const FIRMS_SOURCES: FirmsSource[] = [
  {
    id: 'viirs-noaa20',
    label: 'VIIRS NOAA-20',
    sensor: 'VIIRS',
    apiSource: 'VIIRS_NOAA20_NRT',
    publicPath: 'noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv',
  },
  {
    id: 'viirs-noaa21',
    label: 'VIIRS NOAA-21',
    sensor: 'VIIRS',
    apiSource: 'VIIRS_NOAA21_NRT',
    publicPath: 'noaa-21-viirs-c2/csv/J2_VIIRS_C2_South_America_24h.csv',
  },
  {
    id: 'viirs-snpp',
    label: 'VIIRS Suomi-NPP',
    sensor: 'VIIRS',
    apiSource: 'VIIRS_SNPP_NRT',
    publicPath: 'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv',
  },
  {
    id: 'modis',
    label: 'MODIS Terra/Aqua',
    sensor: 'MODIS',
    apiSource: 'MODIS_NRT',
    publicPath: 'modis-c6.1/csv/MODIS_C6_1_South_America_24h.csv',
  },
];

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov';

/**
 * Con MAP_KEY se pide solo la zona (más liviano, hasta 1 día). Sin clave se descarga el archivo
 * público de Sudamérica de las últimas 24 h y se filtra aquí.
 */
export function firmsUrl(source: FirmsSource, bbox: Bbox, mapKey?: string): string {
  if (mapKey) {
    const area = bbox.map((v) => v.toFixed(4)).join(',');
    return `${FIRMS_BASE}/api/area/csv/${encodeURIComponent(mapKey)}/${source.apiSource}/${area}/1`;
  }
  return `${FIRMS_BASE}/data/active_fire/${source.publicPath}`;
}

export interface CsvTable {
  columns: string[];
  rows: Record<string, string>[];
}

export function parseCsv(text: string): CsvTable {
  const rows = parse(text, { columns: true, bom: true, skip_empty_lines: true, trim: true, relax_column_count: true }) as Record<
    string,
    string
  >[];
  const header = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';
  return { columns: header ? header.split(',').map((c) => c.trim()) : [], rows };
}

/** Filas cuyo punto cae dentro del rectángulo (bordes incluidos). */
export function inBbox(rows: Record<string, string>[], [w, s, e, n]: Bbox): Record<string, string>[] {
  return rows.filter((r) => {
    const lat = Number(r['latitude']);
    const lon = Number(r['longitude']);
    return Number.isFinite(lat) && Number.isFinite(lon) && lon >= w && lon <= e && lat >= s && lat <= n;
  });
}

/** Vuelve a armar un CSV con las columnas originales (para pasarlo al importador de siempre). */
export function toCsv(columns: string[], rows: Record<string, string>[]): string {
  const celda = (v: string | undefined) => {
    const texto = v ?? '';
    return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => celda(r[c])).join(','))].join('\n') + '\n';
}
