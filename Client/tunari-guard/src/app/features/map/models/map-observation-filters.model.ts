import { ConfidenceLevel } from './observation.model';

export interface MapObservationFilters {
  minConfidence: '' | ConfidenceLevel;
  minFrpMw: number | null;
  dayNight: '' | 'D' | 'N';
  platforms: string[];
}

export const DEFAULT_MAP_OBSERVATION_FILTERS: Readonly<MapObservationFilters> = {
  minConfidence: '',
  minFrpMw: null,
  dayNight: '',
  platforms: [],
};
