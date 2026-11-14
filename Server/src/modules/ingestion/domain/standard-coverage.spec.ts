import type { NormalizedObservation } from './normalized-observation.js';
import { StandardCoverage, isNrt } from './standard-coverage.js';

const obs = (platform: string, iso: string, productVersion: string | null, latitude = -17.4, longitude = -66.2) =>
  ({ platform, acquiredAt: new Date(iso), productVersion, latitude, longitude }) as NormalizedObservation;

describe('StandardCoverage', () => {
  it('junta el rango de días UTC y el rectángulo por plataforma, ignorando las NRT', () => {
    const coverage = new StandardCoverage();
    coverage.add([
      obs('SNPP', '2026-07-10T05:00:00Z', '2', -17.3, -66.1),
      obs('SNPP', '2026-07-02T23:59:00Z', '2', -17.5, -66.3),
      obs('SNPP', '2026-08-30T00:00:00Z', '2.0NRT', -10, -60),
    ]);
    coverage.add([obs('NOAA20', '2026-07-05T12:00:00Z', '2.0', -17.8, -63.2), obs('SNPP', '2026-07-20T01:00:00Z', null, -17.4, -66.0)]);
    expect(coverage.toArray()).toEqual([
      { platform: 'NOAA20', from: '2026-07-05', to: '2026-07-05', minLat: -17.8, maxLat: -17.8, minLon: -63.2, maxLon: -63.2 },
      { platform: 'SNPP', from: '2026-07-02', to: '2026-07-20', minLat: -17.5, maxLat: -17.3, minLon: -66.3, maxLon: -66 },
    ]);
  });

  it('detecta NRT sin importar mayúsculas', () => {
    expect(isNrt('6.1NRT')).toBe(true);
    expect(isNrt('2.0nrt')).toBe(true);
    expect(isNrt('6.1')).toBe(false);
    expect(isNrt(null)).toBe(false);
  });
});
