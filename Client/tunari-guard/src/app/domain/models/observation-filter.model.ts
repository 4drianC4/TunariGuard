import { SensorType } from '../enums/sensor-type.enum';
export interface ObservationFilter {
  readonly sensor: SensorType | 'ALL';
  readonly fromUtc?: string;
  readonly toUtc?: string;
  readonly districtId?: string;
}