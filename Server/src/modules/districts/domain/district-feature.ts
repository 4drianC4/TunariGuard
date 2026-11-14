import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export interface DistrictInput {
  code: string;
  name: string;
  /** Geometría GeoJSON (Polygon o MultiPolygon) en WGS84, serializada. */
  geometry: string;
}

export interface DistrictFeatureOptions {
  codeProperty: string;
  nameProperty: string;
}

/**
 * Extrae distritos de un FeatureCollection GeoJSON (RFC 7946, WGS84 lon/lat).
 * Rechaza geometrías que no sean polígonos y coordenadas que parecen proyectadas (p. ej. UTM).
 */
export function extractDistricts(
  collection: unknown,
  { codeProperty, nameProperty }: DistrictFeatureOptions,
): DistrictInput[] {
  if (!isFeatureCollection(collection)) {
    throw new Error('El archivo debe ser un FeatureCollection GeoJSON');
  }
  if (collection.features.length === 0) throw new Error('El FeatureCollection no tiene features');

  const codes = new Set<string>();
  return collection.features.map((feature, index) => {
    const label = `feature ${index}`;
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) {
      throw new Error(`${label}: se esperaba Polygon o MultiPolygon`);
    }
    assertWgs84(geometry, label);

    const code = readProperty(feature, codeProperty);
    const name = readProperty(feature, nameProperty);
    if (!code) throw new Error(`${label}: falta la propiedad "${codeProperty}"`);
    if (!name) throw new Error(`${label}: falta la propiedad "${nameProperty}"`);
    if (codes.has(code)) throw new Error(`${label}: código repetido "${code}"`);
    codes.add(code);

    return { code, name, geometry: JSON.stringify(geometry) };
  });
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'FeatureCollection' &&
    Array.isArray((value as { features?: unknown }).features)
  );
}

function readProperty(feature: Feature, key: string): string | undefined {
  const value = feature.properties?.[key] as unknown;
  if (value === null || value === undefined) return undefined;
  const text = String(value as string | number).trim();
  return text || undefined;
}

function assertWgs84(geometry: Polygon | MultiPolygon, label: string): void {
  const positions: Position[] =
    geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates.flat(2);
  if (positions.length === 0) throw new Error(`${label}: geometría vacía`);
  for (const [lon, lat] of positions) {
    if (
      typeof lon !== 'number' ||
      typeof lat !== 'number' ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90
    ) {
      throw new Error(
        `${label}: coordenadas fuera de WGS84 (${String(lon)}, ${String(lat)}); ` +
          'reproyecta el archivo a EPSG:4326',
      );
    }
  }
}
