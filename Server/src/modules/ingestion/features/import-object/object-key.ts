import { randomUUID } from 'node:crypto';

/**
 * Clave S3 para un CSV subido: `csv/AAAA-MM-DD/<id>-<nombre-saneado>.csv`. El prefijo por
 * fecha ordena el bucket en la consola y el id evita que dos subidas del mismo nombre se pisen.
 */
export function buildCsvObjectKey(fileName: string, now = new Date(), id = randomUUID().slice(0, 8)): string {
  const base = fileName
    .split(/[\\/]/)
    .pop()!
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\.csv$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  return `csv/${now.toISOString().slice(0, 10)}/${id}-${base || 'archivo'}.csv`;
}
