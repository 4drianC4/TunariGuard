import type { Feature, FeatureCollection, Geometry } from 'geojson';

type Fila = Record<string, unknown>;

/**
 * CSV RFC 4180: columnas en el orden de la primera fila, comillas solo cuando hacen falta.
 * Lleva BOM para que Excel en Windows abra bien los acentos.
 */
export function aCsv(filas: Fila[], columnas = Object.keys(filas[0] ?? {})): string {
  const celda = (valor: unknown): string => {
    if (valor === null || valor === undefined) return '';
    const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor as string | number | boolean);
    return /[",\r\n]/.test(texto) ? `"${texto.replaceAll('"', '""')}"` : texto;
  };
  const lineas = [columnas.join(','), ...filas.map((fila) => columnas.map((c) => celda(fila[c])).join(','))];
  return `﻿${lineas.join('\r\n')}\r\n`;
}

/** Filas con una columna de geometría GeoJSON → FeatureCollection; el resto queda en properties. */
export function aFeatureCollection(filas: Fila[], columnaGeometria = 'geometria'): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: filas.map((fila): Feature => {
      const { [columnaGeometria]: geometria, ...properties } = fila;
      return { type: 'Feature', geometry: (geometria ?? null) as Geometry, properties };
    }),
  };
}

/** Detecciones (lat/lon) → FeatureCollection de puntos. */
export function deteccionesAFeatureCollection(filas: Fila[]): FeatureCollection {
  return aFeatureCollection(
    filas.map((fila) => ({ ...fila, geometria: { type: 'Point', coordinates: [fila['lon'], fila['lat']] } })),
  );
}
