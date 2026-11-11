import { DataOrigin } from '../../domain/enums/data-origin.enum';
import { SensorType } from '../../domain/enums/sensor-type.enum';
import { SatelliteObservation } from '../../domain/models/satellite-observation.model';

export const DEMO_OBSERVATIONS = [
  { id: 'demo-v01', sensor: SensorType.VIIRS, platform: 'SNPP', position: { lat: -17.318, lng: -66.154 }, acquiredAtUtc: '2026-11-08T16:15:00Z', confidenceRaw: 'n', frpMw: 12.4, source: DataOrigin.SIMULATED, dataset: 'DEMO' },
  { id: 'demo-m01', sensor: SensorType.MODIS, platform: 'TERRA', position: { lat: -17.322, lng: -66.157 }, acquiredAtUtc: '2026-11-08T16:28:00Z', confidenceRaw: 72, frpMw: 18.1, source: DataOrigin.SIMULATED, dataset: 'DEMO' },
  { id: 'demo-v02', sensor: SensorType.VIIRS, platform: 'NOAA20', position: { lat: -17.303, lng: -66.183 }, acquiredAtUtc: '2026-11-08T17:10:00Z', confidenceRaw: 'h', frpMw: 6.8, source: DataOrigin.SIMULATED, dataset: 'DEMO' },
  { id: 'demo-v03', sensor: SensorType.VIIRS, platform: 'NOAA21', position: { lat: -17.295, lng: -66.203 }, acquiredAtUtc: '2026-11-08T18:10:00Z', confidenceRaw: 'n', frpMw: 9.2, source: DataOrigin.SIMULATED, dataset: 'DEMO' },
] satisfies SatelliteObservation[];