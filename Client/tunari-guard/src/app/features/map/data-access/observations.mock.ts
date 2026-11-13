import { SensorType } from '../../../domain/enums/sensor-type.enum';
import { Observation } from '../models/observation.model';

/** Fake fixtures mirror the Observation DTO so demo and API data share one contract. */
function demoObservation(
  id: string,
  sensor: SensorType,
  platform: Observation['platform'],
  acquiredAtUtc: string,
  lat: number,
  lng: number,
  confidenceRaw: string | number,
  confidenceLevel: NonNullable<Observation['confidenceLevel']>,
  frpMw: number,
): Observation {
  return {
    id,
    sensor,
    platform,
    position: { lat, lng },
    acquiredAtUtc,
    confidenceRaw,
    confidenceLevel,
    brightnessKelvin: null,
    brightnessAuxKelvin: null,
    frpMw,
    scan: null,
    track: null,
    dayNight: null,
    productVersion: null,
    source: 'SIMULATED',
    dataset: 'Tunari Guard demo fixtures',
    batchId: `demo-batch-${id.slice(-3)}`,
    districtAssignment: 'PENDING',
    district: null,
  };
}

export const MOCK_OBSERVATIONS: Observation[] = [
  demoObservation('DEMO-001', SensorType.VIIRS, 'SNPP', '2024-08-12T22:42:00Z', -17.280, -66.330, 'nominal', 'NOMINAL', 7.8),
  demoObservation('DEMO-002', SensorType.MODIS, 'TERRA', '2023-09-03T18:18:00Z', -17.305, -66.285, 82, 'HIGH', 12.4),
  demoObservation('DEMO-003', SensorType.VIIRS, 'NOAA20', '2022-08-21T23:05:00Z', -17.345, -66.240, 'high', 'HIGH', 24.1),
  demoObservation('DEMO-004', SensorType.MODIS, 'AQUA', '2021-10-07T17:54:00Z', -17.370, -66.190, 76, 'NOMINAL', 9.3),
  demoObservation('DEMO-005', SensorType.VIIRS, 'SNPP', '2020-07-19T00:11:00Z', -17.405, -66.300, 'nominal', 'NOMINAL', 4.2),
  demoObservation('DEMO-006', SensorType.MODIS, 'TERRA', '2019-09-11T19:22:00Z', -17.420, -66.235, 91, 'HIGH', 18.7),
  demoObservation('DEMO-007', SensorType.VIIRS, 'NOAA20', '2025-08-29T22:31:00Z', -17.265, -66.205, 'high', 'HIGH', 31.6),
  demoObservation('DEMO-008', SensorType.MODIS, 'AQUA', '2018-10-02T18:02:00Z', -17.455, -66.280, 68, 'NOMINAL', 6.5),
  demoObservation('DEMO-009', SensorType.VIIRS, 'SNPP', '2024-09-22T23:46:00Z', -17.330, -66.145, 'nominal', 'NOMINAL', 11.2),
  demoObservation('DEMO-010', SensorType.MODIS, 'TERRA', '2017-08-14T19:08:00Z', -17.390, -66.350, 88, 'HIGH', 15.9),
  demoObservation('DEMO-011', SensorType.VIIRS, 'NOAA20', '2023-07-26T22:57:00Z', -17.295, -66.255, 'high', 'HIGH', 27.5),
  demoObservation('DEMO-012', SensorType.MODIS, 'AQUA', '2016-09-30T17:38:00Z', -17.435, -66.165, 73, 'NOMINAL', 8.1),
];
