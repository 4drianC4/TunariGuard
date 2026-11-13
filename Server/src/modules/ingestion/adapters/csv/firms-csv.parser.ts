import { parse } from 'csv-parse/sync';
import { normalizeFirmsRecord } from '../../domain/normalize-firms-record.js';
import type {
  NormalizedObservation,
  RowError,
  Sensor,
} from '../../domain/normalized-observation.js';

export interface ParsedFirmsCsv {
  rowsTotal: number;
  observations: NormalizedObservation[];
  errors: RowError[];
}

const REQUIRED_COLUMNS = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'confidence'];

/** Lee un CSV FIRMS completo. Las filas inválidas se reportan sin detener el lote. */
export function parseFirmsCsv(content: string | Buffer, hint?: Sensor): ParsedFirmsCsv {
  let records: Record<string, string>[];
  try {
    records = parse(content, {
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];
  } catch (error) {
    throw new Error(`No se pudo leer el archivo como CSV: ${error instanceof Error ? error.message : String(error)}`);
  }

  const header = Object.keys(records[0] ?? {}).map((c) => c.toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (records.length > 0 && missing.length > 0) {
    throw new Error(`El CSV no tiene formato FIRMS; faltan columnas: ${missing.join(', ')}`);
  }

  const observations: NormalizedObservation[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  records.forEach((record, index) => {
    const line = index + 2;
    try {
      const observation = normalizeFirmsRecord(record, hint);
      if (seen.has(observation.dedupeKey)) {
        errors.push({ line, message: 'Fila repetida dentro del mismo archivo' });
        return;
      }
      seen.add(observation.dedupeKey);
      observations.push(observation);
    } catch (error) {
      errors.push({ line, message: error instanceof Error ? error.message : String(error) });
    }
  });

  return { rowsTotal: records.length, observations, errors };
}
