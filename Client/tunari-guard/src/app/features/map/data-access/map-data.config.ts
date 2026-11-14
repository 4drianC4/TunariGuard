import { MapDataOrigin } from '../models/map-data.model';
import { environment } from '../../../../environments/environment';

/** Mapa alimentado por la configuración compartida del frontend. */
export const MAP_DATA_ORIGIN: MapDataOrigin = environment.mapDataOrigin;
export const MAP_API_BASE = environment.apiBaseUrl.replace(/\/$/, '');
