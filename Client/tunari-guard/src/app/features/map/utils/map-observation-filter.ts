import { SensorType } from '../../../domain/enums/sensor-type.enum';
import { Observation } from '../models/observation.model';
import { MapPeriod } from '../models/map-period.model';
import { MapObservationFilters } from '../models/map-observation-filters.model';

const boliviaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/La_Paz' });

export interface MapLayerVisibility {
  period: MapPeriod;
  showViirs: boolean;
  showModis: boolean;
}

export function filterObservations(
  observations: readonly Observation[],
  filters: MapObservationFilters & MapLayerVisibility & { includesArea: (observation: Observation) => boolean },
): Observation[] {
  if (filters.period.from > filters.period.to) return [];

  const confidenceRank = { LOW: 1, NOMINAL: 2, HIGH: 3 } as const;
  return observations.filter((observation) => {
    const date = boliviaDate.format(new Date(observation.acquiredAtUtc));
    if (date < filters.period.from || date > filters.period.to) return false;
    if (observation.sensor === SensorType.VIIRS && !filters.showViirs) return false;
    if (observation.sensor === SensorType.MODIS && !filters.showModis) return false;
    if (!filters.includesArea(observation)) return false;

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
