import { boliviaTime, buildAlerts, severityOf, shouldNotify, type DetectionForAlert } from './alert-rules.js';

let n = 0;
function det(overrides: Partial<DetectionForAlert> = {}): DetectionForAlert {
  n++;
  return {
    id: `obs-${n}`,
    areaId: 'distrito-09',
    areaName: 'Distrito 9',
    areaType: 'distrito',
    inPark: false,
    sensor: 'VIIRS',
    platform: 'NOAA20',
    acquiredAt: new Date('2026-11-14T18:30:00Z'),
    latitude: -17.45,
    longitude: -66.2,
    confidenceLevel: 'NOMINAL',
    confidenceRaw: 'n',
    frpMw: 3,
    origin: 'REAL',
    batchId: 'lote-1',
    ...overrides,
  };
}

describe('severityOf', () => {
  it('media para una detección nominal fuera del parque', () => {
    expect(severityOf([det()])).toBe('MEDIUM');
  });

  it('alta por confianza alta, por estar en el parque, por 3 detecciones o por FRP alto', () => {
    expect(severityOf([det({ confidenceLevel: 'HIGH' })])).toBe('HIGH');
    expect(severityOf([det({ inPark: true })])).toBe('HIGH');
    expect(severityOf([det(), det(), det()])).toBe('HIGH');
    expect(severityOf([det({ frpMw: 25 })])).toBe('HIGH');
  });

  it('crítica en el parque con confianza alta o varias detecciones, con 5 o más en cualquier área, o FRP muy alto', () => {
    expect(severityOf([det({ inPark: true, confidenceLevel: 'HIGH' })])).toBe('CRITICAL');
    expect(severityOf([det({ inPark: true }), det({ inPark: true }), det({ inPark: true })])).toBe('CRITICAL');
    expect(severityOf([det(), det(), det(), det(), det()])).toBe('CRITICAL');
    expect(severityOf([det({ frpMw: 60 })])).toBe('CRITICAL');
  });
});

describe('buildAlerts', () => {
  it('agrupa por área y satélite, y separa pasadas a más de 20 minutos', () => {
    const t = (iso: string) => new Date(iso);
    const alerts = buildAlerts(
      [
        det({ acquiredAt: t('2026-11-14T18:30:00Z'), frpMw: 2 }),
        det({ acquiredAt: t('2026-11-14T18:31:00Z'), frpMw: 9, latitude: -17.46 }),
        det({ acquiredAt: t('2026-11-14T20:00:00Z') }), // otra pasada
        det({ acquiredAt: t('2026-11-14T18:30:30Z'), platform: 'SNPP' }), // otro satélite
        det({ acquiredAt: t('2026-11-14T18:30:00Z'), areaId: 'mun-tiquipaya', areaName: 'Sector del Tunari en Tiquipaya', areaType: 'municipio_parque', inPark: true }),
      ],
      'LIVE',
    );
    expect(alerts.map((a) => [a.areaId, a.platform, a.detectionCount])).toEqual([
      ['distrito-09', 'NOAA20', 2],
      ['mun-tiquipaya', 'NOAA20', 1],
      ['distrito-09', 'SNPP', 1],
      ['distrito-09', 'NOAA20', 1],
    ]);
    const primera = alerts[0]!;
    expect(primera.latitude).toBe(-17.46); // la detección con más FRP
    expect(primera.maxFrpMw).toBe(9);
    expect(primera.dedupeKey).toBe('LIVE|REAL|distrito-09|NOAA20|2026-11-14T18:30');
  });

  it('con datos simulados en vivo agrupa solo por minuto exacto (una alerta por llegada)', () => {
    const t = (iso: string) => new Date(iso);
    const sim = (iso: string) => det({ origin: 'SIMULATED', acquiredAt: t(iso) });
    const dets = [sim('2026-11-15T02:00:00Z'), sim('2026-11-15T02:05:00Z'), sim('2026-11-15T02:05:00Z'), sim('2026-11-15T02:10:00Z')];
    expect(buildAlerts(dets, 'LIVE').map((a) => a.detectionCount)).toEqual([1, 2, 1]);
    // En un replay se siguen agrupando como una pasada.
    expect(buildAlerts(dets, 'REPLAY').map((a) => a.detectionCount)).toEqual([4]);
  });

  it('arma un mensaje que no afirma un incendio y marca los datos simulados', () => {
    const [real] = buildAlerts(
      [det({ areaId: 'mun-tiquipaya', areaName: 'Sector del Tunari en Tiquipaya', areaType: 'municipio_parque', inPark: true, confidenceLevel: 'HIGH', frpMw: 12.34 })],
      'LIVE',
    );
    expect(real!.message).toBe(
      '1 detección de calor VIIRS (NOAA-20) en Sector del Tunari en Tiquipaya, dentro del Parque Nacional Tunari, ' +
        'el 2026-11-14 a las 14:30 (hora de Bolivia). Confianza alta. Potencia radiativa máxima: 12.3 MW. ' +
        'Requiere verificación: una detección satelital no confirma un incendio.',
    );
    const [demo] = buildAlerts([det()], 'REPLAY');
    expect(demo!.message.startsWith('[Datos simulados] ')).toBe(true);
    expect(demo!.dedupeKey.startsWith('REPLAY|')).toBe(true);
  });
});

describe('shouldNotify', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  it('anuncia lo reciente y el replay, pero no los registros históricos', () => {
    expect(shouldNotify({ mode: 'LIVE', detectedAt: new Date('2026-11-15T03:00:00Z') }, now)).toBe(true);
    expect(shouldNotify({ mode: 'LIVE', detectedAt: new Date('2026-11-13T12:00:00Z') }, now)).toBe(true); // justo 48 h
    expect(shouldNotify({ mode: 'LIVE', detectedAt: new Date('2026-10-25T17:37:00Z') }, now)).toBe(false);
    expect(shouldNotify({ mode: 'REPLAY', detectedAt: new Date('2024-08-20T17:51:00Z') }, now)).toBe(true);
  });
});

describe('boliviaTime', () => {
  it('convierte UTC a UTC−4, incluso cruzando la medianoche', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(boliviaTime(new Date('2026-11-14T02:15:00Z'), now)).toEqual({ date: '2026-11-13', time: '22:15', label: '13 nov, 22:15' });
  });

  it('agrega el año solo si no es el año en curso', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(boliviaTime(new Date('2008-09-05T17:20:00Z'), now).label).toBe('5 sep 2008, 13:20');
    // 1 de enero 02:00 UTC todavía es 31 de diciembre en Bolivia.
    expect(boliviaTime(new Date('2027-01-01T02:00:00Z'), new Date('2026-12-31T20:00:00Z')).label).toBe('31 dic, 22:00');
  });
});
