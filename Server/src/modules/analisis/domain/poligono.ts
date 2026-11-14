/**
 * Valida un Polygon/MultiPolygon GeoJSON en WGS84 antes de enviarlo a PostGIS: anillos cerrados
 * de al menos 4 posiciones [lon, lat] dentro de rango. Devuelve el primer problema o null.
 */
export function problemaDePoligono(geometria: { type: string; coordinates: unknown }): string | null {
  const poligonos = geometria.type === 'MultiPolygon' ? geometria.coordinates : [geometria.coordinates];
  if (!Array.isArray(poligonos) || poligonos.length === 0) return 'coordinates está vacío';

  for (const [p, anillos] of poligonos.entries()) {
    if (!Array.isArray(anillos) || anillos.length === 0) return `el polígono ${p} no tiene anillos`;
    for (const [a, anillo] of anillos.entries()) {
      const donde = `anillo ${a}${geometria.type === 'MultiPolygon' ? ` del polígono ${p}` : ''}`;
      if (!Array.isArray(anillo) || anillo.length < 4) return `el ${donde} necesita al menos 4 posiciones (cerrado)`;
      for (const posicion of anillo) {
        if (!esPosicion(posicion)) return `el ${donde} tiene una posición inválida: se espera [lon, lat] en WGS84`;
      }
      const [primera, ultima] = [anillo[0] as number[], anillo.at(-1) as number[]];
      if (primera[0] !== ultima[0] || primera[1] !== ultima[1]) return `el ${donde} no está cerrado (la última posición debe repetir la primera)`;
    }
  }
  return null;
}

function esPosicion(valor: unknown): boolean {
  if (!Array.isArray(valor) || valor.length < 2) return false;
  const [lon, lat] = valor as unknown[];
  return (
    typeof lon === 'number' && typeof lat === 'number' &&
    Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
  );
}
