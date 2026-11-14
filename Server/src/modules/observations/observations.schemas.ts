import { z } from 'zod';
import { bbox } from '../../shared/query-schemas.js';

/** Fecha ISO 8601 (YYYY-MM-DD o fecha-hora con zona). Sin zona explícita se interpreta en UTC. */
const isoDate = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value));


export const listObservationsQuerySchema = z
  .object({
    sensor: z.enum(['MODIS', 'VIIRS']).optional(),
    platform: z.enum(['TERRA', 'AQUA', 'SNPP', 'NOAA20', 'NOAA21']).optional(),
    from: isoDate.optional().describe('Desde, inclusive (ISO 8601; p. ej. 2024-09-10 o 2024-09-10T12:00:00Z)'),
    to: isoDate.optional().describe('Hasta, inclusive (ISO 8601)'),
    district: z.string().trim().min(1).optional().describe('Código del distrito'),
    assignment: z.enum(['PENDING', 'ASSIGNED', 'OUTSIDE', 'AMBIGUOUS']).optional(),
    minConfidence: z.enum(['LOW', 'NOMINAL', 'HIGH']).optional().describe('Clase mínima de confianza'),
    origin: z.enum(['REAL', 'SIMULATED']).optional(),
    batchId: z.uuid().optional(),
    bbox: bbox.optional(),
    detectionType: z
      .enum(['vegetation', 'all'])
      .default('vegetation')
      .describe('vegetation: tipo FIRMS 0 o desconocido (por defecto); all: incluye volcanes y fuentes estáticas'),
    format: z.enum(['json', 'geojson']).default('json'),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
    cursor: z.uuid().optional().describe('nextCursor de la página anterior'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from debe ser anterior a to', path: ['from'] });

export type ListObservationsQuery = z.infer<typeof listObservationsQuerySchema>;
