import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { parse } from 'csv-parse';
import { normalizeFirmsRecord } from '../../domain/normalize-firms-record.js';
import type {
  NormalizedObservation,
  RowError,
  Sensor,
} from '../../domain/normalized-observation.js';

/** El archivo no es un CSV legible o no tiene formato FIRMS. Se traduce a 400. */
export class CsvFormatError extends Error {}

export interface FirmsCsvOptions {
  /** Sensor a asumir si el CSV no trae la columna instrument. */
  hint?: Sensor;
  /** Observaciones por llamada a `onChunk`; acota la memoria con archivos grandes. */
  chunkSize?: number;
  /** Errores de fila que se conservan con detalle; el total siempre va en `rejected`. */
  maxErrors?: number;
  onChunk: (observations: NormalizedObservation[]) => Promise<void>;
}

export interface FirmsCsvSummary {
  rowsTotal: number;
  /** Filas válidas entregadas a `onChunk`. */
  accepted: number;
  rejected: number;
  errors: RowError[];
  /** SHA-256 del archivo tal como se leyó. */
  checksum: string;
  bytes: number;
}

const REQUIRED_COLUMNS = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'confidence'];

/**
 * Lee un CSV FIRMS por streaming y entrega las filas válidas en bloques. Respeta la
 * contrapresión: no lee más del archivo mientras `onChunk` está guardando el bloque anterior.
 * Las filas inválidas se reportan con su línea sin detener el lote.
 */
export async function readFirmsCsv(
  input: Readable | string | Buffer,
  { hint, chunkSize = 2000, maxErrors = 100, onChunk }: FirmsCsvOptions,
): Promise<FirmsCsvSummary> {
  const source = typeof input === 'string' || Buffer.isBuffer(input) ? Readable.from([input]) : input;

  const hash = createHash('sha256');
  let bytes = 0;
  const hasher = new Transform({
    transform(data: Buffer, _encoding, callback) {
      hash.update(data);
      bytes += data.length;
      callback(null, data);
    },
  });
  const parser = parse({ columns: true, bom: true, skip_empty_lines: true, trim: true, relax_column_count: true });

  // pipe() no propaga errores: se reenvían para que el for-await termine con el error real.
  source.on('error', (error) => parser.destroy(error));
  hasher.on('error', (error) => parser.destroy(error));
  source.pipe(hasher).pipe(parser);

  const errors: RowError[] = [];
  const seen = new Set<string>();
  let pending: NormalizedObservation[] = [];
  let rowsTotal = 0;
  let accepted = 0;
  let rejected = 0;

  const reject = (line: number, message: string) => {
    rejected++;
    if (errors.length < maxErrors) errors.push({ line, message });
  };

  try {
    for await (const record of parser as AsyncIterable<Record<string, string>>) {
      if (rowsTotal === 0) assertFirmsHeader(record);
      rowsTotal++;
      const line = rowsTotal + 1;
      try {
        const observation = normalizeFirmsRecord(record, hint);
        if (seen.has(observation.dedupeKey)) {
          reject(line, 'Fila repetida dentro del mismo archivo');
          continue;
        }
        seen.add(observation.dedupeKey);
        pending.push(observation);
        accepted++;
      } catch (error) {
        reject(line, error instanceof Error ? error.message : String(error));
      }

      if (pending.length >= chunkSize) {
        const ready = pending;
        pending = [];
        await onChunk(ready);
      }
    }
  } catch (error) {
    source.destroy();
    if (error instanceof CsvFormatError || !isCsvParseError(error)) throw error;
    throw new CsvFormatError(`No se pudo leer el archivo como CSV: ${(error as Error).message}`);
  }

  if (pending.length > 0) await onChunk(pending);
  return { rowsTotal, accepted, rejected, errors, checksum: hash.digest('hex'), bytes };
}

function assertFirmsHeader(record: Record<string, string>): void {
  const header = Object.keys(record).map((column) => column.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new CsvFormatError(`El CSV no tiene formato FIRMS; faltan columnas: ${missing.join(', ')}`);
  }
}

/** csv-parse marca sus errores con un `code` CSV_*. */
function isCsvParseError(error: unknown): boolean {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.startsWith('CSV_');
}
