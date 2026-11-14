import { Observation } from './observation.model';
export type { MapEntitySelection } from '../../../domain/models/map-entity-selection.model';

export type MapDataOrigin = 'DEMO' | 'BACKEND' | 'ARCHIVE';

export interface MapDataSet {
  origin: MapDataOrigin;
  observations: Observation[];
}

export type MapDataStatus = 'loading' | 'ready' | 'error';

