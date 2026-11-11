import { DataOrigin } from '../enums/data-origin.enum';
import { SensorType } from '../enums/sensor-type.enum';
import { Severity } from '../enums/severity.enum';
import { GeoPoint } from './geo-point.model';

/** Resultado de agrupamiento provisional con trazabilidad, nunca confirmacion terrestre. */
export interface HarmonizedHotspot {
  readonly id: string;
  readonly center: GeoPoint;
  readonly firstSeenUtc: string;
  readonly lastSeenUtc: string;
  readonly observationIds: readonly string[];
  readonly sensors: readonly SensorType[];
  readonly severity: Severity;
  readonly methodVersion: string;
  readonly source: DataOrigin;
}