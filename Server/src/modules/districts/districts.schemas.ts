import { z } from 'zod';

const booleanFromForm = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => value === true || value === 'true');

/** Campos de texto del formulario multipart que acompaña al GeoJSON. */
export const importDistrictsBodySchema = z.object({
  source: z.string().trim().min(1).describe('Procedencia de la cartografía (institución o URL)'),
  version: z.string().trim().min(1).describe('Versión o fecha de la cartografía'),
  provisional: booleanFromForm
    .default(false)
    .describe('true si los límites no son oficiales; se mostrará como provisional'),
  codeProperty: z.string().trim().min(1).default('code').describe('Propiedad con el código del distrito'),
  nameProperty: z.string().trim().min(1).default('name').describe('Propiedad con el nombre del distrito'),
});
export type ImportDistrictsBody = z.infer<typeof importDistrictsBodySchema>;

export const listDistrictsQuerySchema = z.object({
  format: z.enum(['json', 'geojson']).default('json').describe('geojson incluye las geometrías'),
});
export type ListDistrictsQuery = z.infer<typeof listDistrictsQuerySchema>;
