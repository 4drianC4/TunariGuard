import { ConfidenceLevel, DayNight, SatellitePlatform } from './observation.model';

export interface MapObservationFilters {
  minConfidence: '' | ConfidenceLevel;
  minFrpMw: number | null;
  dayNight: '' | DayNight;
  platforms: SatellitePlatform[];
}

export const DEFAULT_MAP_OBSERVATION_FILTERS: Readonly<MapObservationFilters> = {
  minConfidence: '',
  minFrpMw: null,
  dayNight: '',
  platforms: [],
};
