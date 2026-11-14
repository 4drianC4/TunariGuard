import { z } from 'zod';
import { importCsvBodySchema } from '../import-csv/import-csv.schemas.js';

export const createUploadSchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.csv$/i, 'Solo se aceptan archivos .csv')
    .describe('Nombre original del archivo; se usa para armar la clave del objeto'),
  expiresInSeconds: z.coerce
    .number()
    .int()
    .min(60)
    .max(24 * 3600)
    .default(3600)
    .describe('Validez de la URL de subida'),
});
export type CreateUploadBody = z.infer<typeof createUploadSchema>;

export const listUploadsSchema = z.object({
  prefix: z.string().trim().max(512).optional().describe('Filtra por prefijo, p. ej. "csv/2026-11-13/"'),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
});
export type ListUploadsQuery = z.infer<typeof listUploadsSchema>;

export const importObjectSchema = importCsvBodySchema.extend({
  objectKey: z
    .string()
    .trim()
    .min(1)
    .max(1024)
    .refine((key) => !key.startsWith('/'), 'La clave no debe empezar con "/"')
    .describe('Clave del objeto en el bucket (devuelta por POST /ingestion/uploads o vista en la consola)'),
});
export type ImportObjectBody = z.infer<typeof importObjectSchema>;
