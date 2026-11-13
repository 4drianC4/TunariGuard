import type { MapPeriod } from '../../../domain/models/map-period.model';

export type { MapPeriod } from '../../../domain/models/map-period.model';

/** DEMO coverage only; this is a default range, not a temporal control. */
export const DEMO_MAP_PERIOD: Readonly<MapPeriod> = {
  from: '2016-01-01',
  to: '2025-12-30'
};
