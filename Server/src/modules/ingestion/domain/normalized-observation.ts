/**
 * Tipos del dominio de ingesta. No dependen de NestJS ni de Prisma: los valores
 * coinciden con los enums de la base para que el adaptador de persistencia los pase tal cual.
 */
export type Sensor = 'MODIS' | 'VIIRS';
export type Platform = 'TERRA' | 'AQUA' | 'SNPP' | 'NOAA20' | 'NOAA21';
export type ConfidenceLevel = 'LOW' | 'NOMINAL' | 'HIGH';
export type DayNight = 'DAY' | 'NIGHT';
export type DataOrigin = 'REAL' | 'SIMULATED';

/** Una fila FIRMS validada y normalizada. Conserva la fila original en `raw`. */
export interface NormalizedObservation {
  dedupeKey: string;
  sensor: Sensor;
  platform: Platform;
  latitude: number;
  longitude: number;
  acquiredAt: Date;
  confidenceRaw: string;
  confidenceLevel: ConfidenceLevel | null;
  brightnessK: number | null;
  brightnessAuxK: number | null;
  frpMw: number | null;
  scan: number | null;
  track: number | null;
  dayNight: DayNight | null;
  productVersion: string | null;
  /** Columna `type` de FIRMS (0 vegetación, 1 volcán, 2 fuente estática, 3 costa afuera). */
  detectionType: number | null;
  raw: Record<string, string>;
}

export interface RowError {
  /** Número de línea en el archivo (la cabecera es la línea 1). */
  line: number;
  message: string;
}
