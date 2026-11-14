import { z } from 'zod';

/** Booleano en query string: solo "true"/"false" (z.coerce.boolean convertiría "false" en true). */
export const queryBoolean = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Booleano que puede llegar como texto (formulario multipart: "true"/"false") o como booleano
 * (cuerpo JSON). Así el mismo esquema sirve para POST /ingestion/csv y /ingestion/uploads/import.
 */
export const formBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

/** Día calendario YYYY-MM-DD; se conserva como texto para pasarlo a columnas `date` sin zona horaria. */
export const isoDay = z.iso.date();

/** minLon,minLat,maxLon,maxLat en WGS84. */
export const bbox = z
  .string()
  .transform((value, ctx) => {
    const parts = value.split(',').map(Number);
    const [minLon, minLat, maxLon, maxLat] = parts;
    const valid =
      parts.length === 4 &&
      parts.every(Number.isFinite) &&
      minLon! >= -180 && maxLon! <= 180 && minLat! >= -90 && maxLat! <= 90 &&
      minLon! <= maxLon! && minLat! <= maxLat!;
    if (!valid) {
      ctx.addIssue({ code: 'custom', message: 'bbox debe ser minLon,minLat,maxLon,maxLat en WGS84' });
      return z.NEVER;
    }
    return parts as [number, number, number, number];
  })
  .describe('Área visible del mapa: minLon,minLat,maxLon,maxLat');
