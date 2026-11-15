import type { MapPeriod } from '../../../domain/models/map-period.model';

export type { MapPeriod } from '../../../domain/models/map-period.model';

/** Initial range spans the available archive through today's local date. */
const todayInBolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/La_Paz',
}).format(new Date());

export const DEFAULT_ARCHIVE_PERIOD: Readonly<MapPeriod> = {
  from: '2001-08-09',
  to: todayInBolivia,
};
