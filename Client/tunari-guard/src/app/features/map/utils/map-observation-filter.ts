import { Observation } from '../models/observation.model';
import { MapObservationFilters } from '../models/map-observation-filters.model';

export function filterObservations(
  observations: readonly Observation[],
  filters: MapObservationFilters & { excludePersistent: boolean },
): Observation[] {
  const confidenceRank = { LOW: 1, NOMINAL: 2, HIGH: 3 } as const;
  return observations.filter((observation) => {
    if (filters.excludePersistent && observation.archive?.persistent) return false;

    const confidence = observation.confidenceLevel;
    if (filters.minConfidence && (!confidence || confidenceRank[confidence] < confidenceRank[filters.minConfidence])) {
      return false;
    }
    if (filters.minFrpMw !== null && (observation.frpMw == null || observation.frpMw < filters.minFrpMw)) {
      return false;
    }
    if (filters.dayNight && observation.dayNight !== filters.dayNight) return false;
    if (filters.platforms.length && !filters.platforms.includes(observation.platform)) return false;
    return true;
  });
}
