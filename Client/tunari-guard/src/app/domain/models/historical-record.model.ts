
import { DataOrigin } from '../enums/data-origin.enum';
import { SensorType } from '../enums/sensor-type.enum';

/**
 * Fuente de información que puede seleccionar el usuario
 * en el módulo de historial.
 */
export type HistorySource = 'HARMONIZED' | 'MODIS' | 'VIIRS' | SensorType;

/**
 * Registro de actividad agregado por año y mes.
 *
 * activityCount representa:
 * - MODIS: cantidad de observaciones MODIS.
 * - VIIRS: cantidad de observaciones VIIRS.
 * - HARMONIZED: cantidad de hotspots armonizados.
 *
 * No representa incendios confirmados ni hectáreas quemadas.
 */
export interface HistoricalRecord {
  readonly year: number;
  readonly month: number;
  readonly source: HistorySource;
  readonly activityCount: number;
  readonly origin: DataOrigin;
}
