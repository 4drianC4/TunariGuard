import { z } from 'zod';

/** Campos de texto del formulario multipart que acompaña al CSV. */
export const importCsvBodySchema = z.object({
  dataset: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe('Nombre del producto, p. ej. "FIRMS VIIRS_SNPP_NRT"; por defecto, el nombre del archivo'),
  origin: z
    .enum(['REAL', 'SIMULATED'])
    .default('REAL')
    .describe('SIMULATED para datos de demostración; nunca se mezclan sin identificar'),
  sensor: z
    .enum(['MODIS', 'VIIRS'])
    .optional()
    .describe('Solo si el CSV no trae la columna instrument'),
});
export type ImportCsvBody = z.infer<typeof importCsvBodySchema>;
