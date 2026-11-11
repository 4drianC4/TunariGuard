import { SatelliteObservation } from '../models/satellite-observation.model';
import { ObservationFilter } from '../models/observation-filter.model';

/** Puerto para cambiar mock, CSV o API sin acoplar las paginas. */
export interface HotspotRepositoryPort {
  findObservations(filter: ObservationFilter): Promise<readonly SatelliteObservation[]>;
}