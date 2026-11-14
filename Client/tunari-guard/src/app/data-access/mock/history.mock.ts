
import { DataOrigin } from '../../domain/enums/data-origin.enum';
import { SensorType } from '../../domain/enums/sensor-type.enum';
import {
  HistoricalRecord,
  HistorySource,
} from '../../domain/models/historical-record.model';

/**
 * Configuración del periodo histórico.
 */
export const HISTORY_START_YEAR = 2005;
export const HISTORY_END_YEAR = 2026;
export const HISTORY_LAST_MONTH = 11;

/**
 * Cobertura temporal simulada por fuente.
 *
 * Estos límites son para el prototipo y deberán
 * contrastarse con los datasets reales.
 */
const SOURCE_CONFIG: {
  source: HistorySource;
  startYear: number;
  intensity: number;
}[] = [
  {
    source: SensorType.MODIS,
    startYear: 2005,
    intensity: 1.0,
  },
  {
    source: SensorType.VIIRS,
    startYear: 2012,
    intensity: 1.2,
  },
  {
    source: 'HARMONIZED',
    startYear: 2012,
    intensity: 0.75,
  },
];

/**
 * Intensidad estacional simulada.
 *
 * Mayor actividad durante la temporada seca.
 * No representa mediciones reales del Tunari.
 */
const SEASONAL_PATTERN = [
  0.15, // Enero
  0.15, // Febrero
  0.20, // Marzo
  0.20, // Abril
  0.25, // Mayo
  0.35, // Junio
  0.65, // Julio
  0.90, // Agosto
  1.00, // Septiembre
  0.85, // Octubre
  0.45, // Noviembre
  0.20, // Diciembre
];

/**
 * Genera un valor determinista para que los datos
 * no cambien al recargar la aplicación.
 *
 * IMPORTANTE: únicamente genera datos DEMO.
 */
function generateActivityCount(
  year: number,
  month: number,
  source: HistorySource,
  intensity: number,
): number {
  const sourceOffset =
    source === 'HARMONIZED'
      ? 17
      : source === SensorType.MODIS
        ? 5
        : 11;

  const variation =
    (year * 7 + month * 13 + sourceOffset) % 12;

  const seasonalFactor = SEASONAL_PATTERN[month - 1];

  const yearFactor = 0.85 + ((year - 2005) % 8) * 0.035;

  const base = 8 + variation * 2;

  return Math.round(
    base * seasonalFactor * intensity * yearFactor,
  );
}

/**
 * Construye la colección de registros históricos simulados.
 */
function buildHistoryMock(): HistoricalRecord[] {
  const records: HistoricalRecord[] = [];

  for (const config of SOURCE_CONFIG) {
    for (
      let year = config.startYear;
      year <= HISTORY_END_YEAR;
      year++
    ) {
      const lastMonth =
        year === HISTORY_END_YEAR
          ? HISTORY_LAST_MONTH
          : 12;

      for (let month = 1; month <= lastMonth; month++) {
        records.push({
          year,
          month,
          source: config.source,
          activityCount: generateActivityCount(
            year,
            month,
            config.source,
            config.intensity,
          ),
          origin: DataOrigin.SIMULATED,
        });
      }
    }
  }

  return records;
}

/**
 * Todos los registros del historial DEMO.
 */
export const DEMO_HISTORY_RECORDS: readonly HistoricalRecord[] =
  buildHistoryMock();

/**
 * Obtiene el historial de una fuente específica.
 */
export function getHistoryMock(
  source: HistorySource,
): readonly HistoricalRecord[] {
  return DEMO_HISTORY_RECORDS.filter(
    (record) => record.source === source,
  );
}
