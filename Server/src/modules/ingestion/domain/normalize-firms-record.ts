import type {
  ConfidenceLevel,
  DayNight,
  NormalizedObservation,
  Platform,
  Sensor,
} from './normalized-observation.js';

/**
 * Normaliza una fila de los CSV de NASA FIRMS (MODIS C6.1 y VIIRS 375 m, NRT o archivo).
 *
 * Columnas MODIS: latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite,
 *   instrument, confidence (0–100), version, bright_t31, frp, daynight.
 * Columnas VIIRS: latitude, longitude, bright_ti4, scan, track, acq_date, acq_time, satellite,
 *   instrument, confidence (l/n/h), version, bright_ti5, frp, daynight.
 *
 * Esta función solo normaliza columnas: no deduplica entre sensores ni armoniza.
 */
export function normalizeFirmsRecord(
  record: Record<string, string>,
  hint?: Sensor,
): NormalizedObservation {
  const row = lowerKeys(record);

  const sensor = detectSensor(row, hint);
  const platform = parsePlatform(row['satellite'], sensor);
  const latitude = requiredNumber(row, 'latitude');
  const longitude = requiredNumber(row, 'longitude');
  if (latitude < -90 || latitude > 90) throw new Error(`latitude fuera de rango: ${latitude}`);
  if (longitude < -180 || longitude > 180) throw new Error(`longitude fuera de rango: ${longitude}`);

  const acquiredAt = parseAcquisition(row['acq_date'], row['acq_time']);
  const confidenceRaw = (row['confidence'] ?? '').trim();
  if (!confidenceRaw) throw new Error('confidence vacío');

  const brightnessK = optionalNumber(row, sensor === 'MODIS' ? 'brightness' : 'bright_ti4');
  const brightnessAuxK = optionalNumber(row, sensor === 'MODIS' ? 'bright_t31' : 'bright_ti5');

  return {
    dedupeKey: buildDedupeKey(sensor, platform, acquiredAt, latitude, longitude),
    sensor,
    platform,
    latitude,
    longitude,
    acquiredAt,
    confidenceRaw,
    confidenceLevel: parseConfidence(confidenceRaw, sensor),
    brightnessK,
    brightnessAuxK,
    frpMw: optionalNumber(row, 'frp'),
    scan: optionalNumber(row, 'scan'),
    track: optionalNumber(row, 'track'),
    dayNight: parseDayNight(row['daynight']),
    productVersion: row['version']?.trim() || null,
    detectionType: parseDetectionType(row['type']),
    raw: { ...record },
  };
}

/** `type` de FIRMS: entero 0–3; vacío o ausente → null (los NRT no lo traen). */
function parseDetectionType(value: string | undefined): number | null {
  const text = value?.trim();
  if (!text) return null;
  const type = Number(text);
  if (!Number.isInteger(type) || type < 0 || type > 3) throw new Error(`type inválido: ${text} (se espera 0, 1, 2 o 3)`);
  return type;
}

/** Huella estable: mismo sensor, plataforma, instante y coordenadas (5 decimales ≈ 1 m). */
export function buildDedupeKey(
  sensor: Sensor,
  platform: Platform,
  acquiredAt: Date,
  latitude: number,
  longitude: number,
): string {
  return [sensor, platform, acquiredAt.toISOString(), latitude.toFixed(5), longitude.toFixed(5)].join(
    '|',
  );
}

function lowerKeys(record: Record<string, string>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k.trim().toLowerCase(), v]));
}

function detectSensor(row: Record<string, string | undefined>, hint?: Sensor): Sensor {
  const instrument = row['instrument']?.trim().toUpperCase();
  if (instrument === 'MODIS' || instrument === 'VIIRS') return instrument;
  if ('bright_ti4' in row) return 'VIIRS';
  if ('brightness' in row) return 'MODIS';
  if (hint) return hint;
  throw new Error('No se pudo determinar el sensor (falta instrument o columnas de brillo)');
}

const PLATFORM_ALIASES: Record<string, Platform> = {
  T: 'TERRA',
  TERRA: 'TERRA',
  A: 'AQUA',
  AQUA: 'AQUA',
  N: 'SNPP',
  NPP: 'SNPP',
  SNPP: 'SNPP',
  'SUOMI NPP': 'SNPP',
  'SUOMI-NPP': 'SNPP',
  N20: 'NOAA20',
  '1': 'NOAA20',
  'NOAA-20': 'NOAA20',
  NOAA20: 'NOAA20',
  J1: 'NOAA20',
  N21: 'NOAA21',
  '2': 'NOAA21',
  'NOAA-21': 'NOAA21',
  NOAA21: 'NOAA21',
  J2: 'NOAA21',
};

const PLATFORMS_BY_SENSOR: Record<Sensor, Platform[]> = {
  MODIS: ['TERRA', 'AQUA'],
  VIIRS: ['SNPP', 'NOAA20', 'NOAA21'],
};

function parsePlatform(value: string | undefined, sensor: Sensor): Platform {
  const platform = PLATFORM_ALIASES[(value ?? '').trim().toUpperCase()];
  if (!platform) throw new Error(`satellite desconocido: "${value ?? ''}"`);
  if (!PLATFORMS_BY_SENSOR[sensor].includes(platform)) {
    throw new Error(`satellite ${platform} no corresponde al sensor ${sensor}`);
  }
  return platform;
}

/** acq_date = YYYY-MM-DD, acq_time = HHMM en UTC (puede venir sin ceros a la izquierda). */
function parseAcquisition(date: string | undefined, time: string | undefined): Date {
  const d = (date ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`acq_date inválido: "${date ?? ''}"`);
  const t = (time ?? '').trim().replace(':', '');
  if (!/^\d{1,4}$/.test(t)) throw new Error(`acq_time inválido: "${time ?? ''}"`);
  const hhmm = t.padStart(4, '0');
  const hours = Number(hhmm.slice(0, 2));
  const minutes = Number(hhmm.slice(2));
  if (hours > 23 || minutes > 59) throw new Error(`acq_time inválido: "${time ?? ''}"`);

  const iso = `${d}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== iso) {
    throw new Error(`acq_date inválido: "${d}"`);
  }
  return parsed;
}

function parseConfidence(raw: string, sensor: Sensor): ConfidenceLevel | null {
  if (sensor === 'MODIS') {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) return null;
    if (value < 30) return 'LOW';
    if (value < 80) return 'NOMINAL';
    return 'HIGH';
  }
  switch (raw.toLowerCase()) {
    case 'l':
    case 'low':
      return 'LOW';
    case 'n':
    case 'nominal':
      return 'NOMINAL';
    case 'h':
    case 'high':
      return 'HIGH';
    default:
      return null;
  }
}

function parseDayNight(value: string | undefined): DayNight | null {
  switch ((value ?? '').trim().toUpperCase()) {
    case 'D':
      return 'DAY';
    case 'N':
      return 'NIGHT';
    default:
      return null;
  }
}

function requiredNumber(row: Record<string, string | undefined>, key: string): number {
  const value = optionalNumber(row, key);
  if (value === null) throw new Error(`${key} vacío o no numérico`);
  return value;
}

function optionalNumber(row: Record<string, string | undefined>, key: string): number | null {
  const text = row[key]?.trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
