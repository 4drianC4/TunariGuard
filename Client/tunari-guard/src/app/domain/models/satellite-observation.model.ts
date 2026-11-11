import { DataOrigin } from '../enums/data-origin.enum';
import { SensorType } from '../enums/sensor-type.enum';
import { GeoPoint } from './geo-point.model';

export type SatellitePlatform = 'TERRA' | 'AQUA' | 'SNPP' | 'NOAA20' | 'NOAA21';

/** Una fila original proveniente de un sensor; no equivale a un incendio confirmado. */
export interface SatelliteObservation {
  readonly id: string;
  readonly sensor: SensorType;
  readonly platform: SatellitePlatform;
  readonly position: GeoPoint;
  readonly acquiredAtUtc: string;
  readonly confidenceRaw: string | number | null;
  readonly confidenceNormalized?: number | null; // 0..1 solamente tras normalizar
  readonly brightnessKelvin?: number | null;
  readonly frpMw?: number | null;
  readonly source: DataOrigin;
  readonly dataset: string;
}