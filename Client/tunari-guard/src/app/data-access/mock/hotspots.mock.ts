import { DataOrigin } from '../../domain/enums/data-origin.enum';
import { SensorType } from '../../domain/enums/sensor-type.enum';
import { Severity } from '../../domain/enums/severity.enum';
import { HarmonizedHotspot } from '../../domain/models/harmonized-hotspot.model';

export const DEMO_HOTSPOTS = [
  { id: 'demo-h01', center: {lat:-17.320,lng:-66.155}, firstSeenUtc:'2026-11-08T16:15:00Z', lastSeenUtc:'2026-11-08T16:28:00Z', observationIds:['demo-v01','demo-m01'], sensors:[SensorType.VIIRS,SensorType.MODIS], severity:Severity.HIGH, methodVersion:'DEMO-MANUAL-0.1', source:DataOrigin.SIMULATED },
  { id: 'demo-h02', center: {lat:-17.303,lng:-66.183}, firstSeenUtc:'2026-11-08T17:10:00Z', lastSeenUtc:'2026-11-08T17:10:00Z', observationIds:['demo-v02'], sensors:[SensorType.VIIRS], severity:Severity.MEDIUM, methodVersion:'DEMO-MANUAL-0.1', source:DataOrigin.SIMULATED },
  { id: 'demo-h03', center: {lat:-17.295,lng:-66.203}, firstSeenUtc:'2026-11-08T18:10:00Z', lastSeenUtc:'2026-11-08T18:10:00Z', observationIds:['demo-v03'], sensors:[SensorType.VIIRS], severity:Severity.LOW, methodVersion:'DEMO-MANUAL-0.1', source:DataOrigin.SIMULATED },
] satisfies HarmonizedHotspot[];