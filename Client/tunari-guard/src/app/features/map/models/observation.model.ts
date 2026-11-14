import { SensorType } from '../../../domain/enums/sensor-type.enum';

/** Observation DTO returned by Server/src/modules/observations/observations.service.ts. */
export type ConfidenceLevel = 'LOW' | 'NOMINAL' | 'HIGH';
export type DayNight = 'DAY' | 'NIGHT';
export type DistrictAssignment = 'PENDING' | 'ASSIGNED' | 'OUTSIDE' | 'AMBIGUOUS';
export type ObservationSource = 'NASA_FIRMS' | 'IMPORTED' | 'SIMULATED';
export type SatellitePlatform = 'TERRA' | 'AQUA' | 'SNPP' | 'NOAA20' | 'NOAA21';

export interface ObservationDistrict {
  code: string;
  name: string;
  provisional: boolean;
}

/** Field names and enum values intentionally mirror the implemented backend DTO. */
export interface Observation {
  id: string;
  sensor: SensorType;
  platform: SatellitePlatform;
  position: { lat: number; lng: number };
  acquiredAtUtc: string;
  confidenceRaw: string | number | null;
  confidenceLevel: ConfidenceLevel | null;
  brightnessKelvin: number | null;
  brightnessAuxKelvin: number | null;
  frpMw: number | null;
  scan: number | null;
  track: number | null;
  dayNight: DayNight | null;
  productVersion: string | null;
  source: ObservationSource;
  dataset: string;
  batchId: string;
  districtAssignment: DistrictAssignment;
  district: ObservationDistrict | null;
}

export type ObservationFeatureProperties = Omit<Observation, 'position'>;
