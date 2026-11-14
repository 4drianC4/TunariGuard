import { HistoricalRecord, HistorySource } from '../../domain/models/historical-record.model';

/**
 * El historial ahora se obtiene desde la API por área y rango de fechas.
 * Se conservan estas exportaciones para no romper imports antiguos mientras
 * se termina de retirar el flujo DEMO del módulo.
 */
export const HISTORY_START_YEAR = 2005;
export const HISTORY_END_YEAR = 2026;
export const HISTORY_LAST_MONTH = 11;

export const DEMO_HISTORY_RECORDS: readonly HistoricalRecord[] = [];

export function getHistoryMock(_source: HistorySource): readonly HistoricalRecord[] {
  return DEMO_HISTORY_RECORDS;
}
