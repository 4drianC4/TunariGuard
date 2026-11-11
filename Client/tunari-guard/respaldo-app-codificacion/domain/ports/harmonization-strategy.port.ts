import { HarmonizationResult } from '../models/harmonization-result.model';
import { SatelliteObservation } from '../models/satellite-observation.model';
export interface HarmonizationStrategyPort {
  harmonize(input: readonly SatelliteObservation[]): HarmonizationResult;
}