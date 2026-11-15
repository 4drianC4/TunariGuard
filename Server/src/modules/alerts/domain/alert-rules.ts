/**
 * Reglas de las alertas operativas. Funciones puras: sin NestJS ni base de datos.
 *
 * Una alerta agrupa las detecciones de una MISMA pasada satelital (mismo satélite, separadas por
 * menos de PASS_WINDOW_MINUTES) dentro de una misma área vigilada. Así una pasada con 10 puntos en
 * un distrito es una alerta, no diez.
 *
 * Los umbrales son reglas operativas para priorizar la revisión, no resultados del modelo
 * estadístico del paquete fuego: se pueden ajustar con el equipo sin tocar el resto del código.
 */

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type AlertModeValue = 'LIVE' | 'REPLAY';
export type ConfidenceLevelValue = 'LOW' | 'NOMINAL' | 'HIGH';

export const PASS_WINDOW_MINUTES = 20;
/**
 * Solo se anuncian en vivo (alert:new) las alertas de detecciones recientes. Las de una carga
 * histórica se guardan igual, pero no se notifican como si fueran novedades.
 */
export const NOTIFY_WINDOW_HOURS = 48;

/** ¿Se anuncia esta alerta en tiempo real? El replay siempre; lo demás solo si es reciente. */
export function shouldNotify(alert: { mode: AlertModeValue; detectedAt: Date }, now = new Date()): boolean {
  if (alert.mode === 'REPLAY') return true;
  const edad = now.getTime() - alert.detectedAt.getTime();
  return edad <= NOTIFY_WINDOW_HOURS * 3_600_000;
}
export const THRESHOLDS = {
  /** Detecciones en una pasada que vuelven crítica a cualquier área. */
  criticalCount: 5,
  /** Detecciones que, dentro del parque o en cualquier área, suben a alta. */
  highCount: 3,
  /** Potencia radiativa (MW) a partir de la cual la alerta es alta / crítica. */
  highFrpMw: 20,
  criticalFrpMw: 50,
} as const;

export interface DetectionForAlert {
  id: string;
  areaId: string;
  areaName: string;
  /** distrito, municipio_parque o parque (tipos de fuego.areas). */
  areaType: string;
  inPark: boolean;
  sensor: 'MODIS' | 'VIIRS';
  platform: string;
  acquiredAt: Date;
  latitude: number;
  longitude: number;
  confidenceLevel: ConfidenceLevelValue | null;
  confidenceRaw: string | null;
  frpMw: number | null;
  origin: 'REAL' | 'SIMULATED';
  batchId: string | null;
}

export interface AlertCandidate {
  dedupeKey: string;
  mode: AlertModeValue;
  origin: 'REAL' | 'SIMULATED';
  severity: Severity;
  areaId: string;
  areaName: string;
  inPark: boolean;
  sensor: 'MODIS' | 'VIIRS';
  platform: string;
  detectedAt: Date;
  latitude: number;
  longitude: number;
  detectionCount: number;
  maxFrpMw: number | null;
  confidenceLevel: ConfidenceLevelValue | null;
  confidenceRaw: string | null;
  message: string;
  observationIds: string[];
  batchId: string | null;
  /** Comentario opcional (p. ej. «reconstrucción histórica» en las alertas generadas retroactivamente). */
  note?: string;
}

/** Agrupa detecciones en alertas: por área y satélite, y dentro de eso por pasada. */
export function buildAlerts(detections: readonly DetectionForAlert[], mode: AlertModeValue): AlertCandidate[] {
  const byAreaAndPlatform = new Map<string, DetectionForAlert[]>();
  for (const d of detections) {
    const key = `${d.areaId}|${d.platform}|${d.origin}`;
    const list = byAreaAndPlatform.get(key);
    if (list) list.push(d);
    else byAreaAndPlatform.set(key, [d]);
  }

  const alerts: AlertCandidate[] = [];
  for (const group of byAreaAndPlatform.values()) {
    // Los datos simulados que llegan en vivo (proyección, alertas de la defensa) pueden venir cada
    // pocos minutos: se agrupan solo si comparten el minuto exacto. Así cada llegada da su alerta y
    // el resultado no depende de cuándo se revise.
    const windowMinutes = mode === 'LIVE' && group[0]!.origin === 'SIMULATED' ? 0 : PASS_WINDOW_MINUTES;
    for (const pass of splitIntoPasses(group, windowMinutes)) alerts.push(toAlert(pass, mode));
  }
  return alerts.sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime() || a.areaId.localeCompare(b.areaId));
}

export function severityOf(pass: readonly DetectionForAlert[]): Severity {
  const count = pass.length;
  const inPark = pass.some((d) => d.inPark);
  const highConfidence = pass.some((d) => d.confidenceLevel === 'HIGH');
  const maxFrp = Math.max(0, ...pass.map((d) => d.frpMw ?? 0));

  if ((inPark && (highConfidence || count >= THRESHOLDS.highCount)) || count >= THRESHOLDS.criticalCount || maxFrp >= THRESHOLDS.criticalFrpMw) {
    return 'CRITICAL';
  }
  if (highConfidence || inPark || count >= THRESHOLDS.highCount || maxFrp >= THRESHOLDS.highFrpMw) return 'HIGH';
  return 'MEDIUM';
}

function splitIntoPasses(group: DetectionForAlert[], windowMinutes: number): DetectionForAlert[][] {
  const sorted = [...group].sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime());
  const passes: DetectionForAlert[][] = [];
  let current: DetectionForAlert[] = [];
  for (const d of sorted) {
    const last = current.at(-1);
    if (last && d.acquiredAt.getTime() - last.acquiredAt.getTime() > windowMinutes * 60_000) {
      passes.push(current);
      current = [];
    }
    current.push(d);
  }
  if (current.length) passes.push(current);
  return passes;
}

function toAlert(pass: DetectionForAlert[], mode: AlertModeValue): AlertCandidate {
  const first = pass[0]!;
  // La detección más fuerte da la ubicación y la confianza que se muestran.
  const strongest = pass.reduce((best, d) => ((d.frpMw ?? -1) > (best.frpMw ?? -1) ? d : best), first);
  const maxFrp = pass.some((d) => d.frpMw !== null) ? Math.max(...pass.map((d) => d.frpMw ?? 0)) : null;
  const confidenceLevel = bestConfidence(pass);
  const inPark = pass.some((d) => d.inPark);

  const candidate = {
    dedupeKey: [mode, first.origin, first.areaId, first.platform, first.acquiredAt.toISOString().slice(0, 16)].join('|'),
    mode,
    origin: first.origin,
    severity: severityOf(pass),
    areaId: first.areaId,
    areaName: first.areaName,
    inPark,
    sensor: first.sensor,
    platform: first.platform,
    detectedAt: first.acquiredAt,
    latitude: strongest.latitude,
    longitude: strongest.longitude,
    detectionCount: pass.length,
    maxFrpMw: maxFrp,
    confidenceLevel,
    confidenceRaw: strongest.confidenceRaw,
    observationIds: pass.map((d) => d.id),
    batchId: first.batchId,
  };
  return { ...candidate, message: alertMessage({ ...candidate, areaType: first.areaType, simulated: mode === 'REPLAY' || first.origin === 'SIMULATED' }) };
}

function bestConfidence(pass: readonly DetectionForAlert[]): ConfidenceLevelValue | null {
  const order: ConfidenceLevelValue[] = ['HIGH', 'NOMINAL', 'LOW'];
  return order.find((level) => pass.some((d) => d.confidenceLevel === level)) ?? null;
}

const PLATFORM_NAMES: Record<string, string> = {
  TERRA: 'Terra',
  AQUA: 'Aqua',
  SNPP: 'Suomi-NPP',
  NOAA20: 'NOAA-20',
  NOAA21: 'NOAA-21',
};
const CONFIDENCE_TEXT: Record<ConfidenceLevelValue, string> = { HIGH: 'alta', NOMINAL: 'nominal', LOW: 'baja' };

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

/** Texto de la alerta. Nunca afirma un incendio: lo pide el paquete de datos. */
export function alertMessage(a: {
  detectionCount: number;
  sensor: string;
  platform: string;
  areaName: string;
  areaType: string;
  inPark: boolean;
  detectedAt: Date;
  confidenceLevel: ConfidenceLevelValue | null;
  maxFrpMw: number | null;
  simulated: boolean;
}): string {
  const { date, time } = boliviaTime(a.detectedAt);
  const cuantas = a.detectionCount === 1 ? '1 detección' : `${a.detectionCount} detecciones`;
  const parque = a.inPark && a.areaType !== 'parque' ? ', dentro del Parque Nacional Tunari' : '';
  const partes = [
    `${a.simulated ? '[Datos simulados] ' : ''}${cuantas} de calor ${a.sensor} (${platformName(a.platform)}) en ${a.areaName}${parque},`,
    `el ${date} a las ${time} (hora de Bolivia).`,
  ];
  if (a.confidenceLevel) partes.push(`Confianza ${CONFIDENCE_TEXT[a.confidenceLevel]}.`);
  if (a.maxFrpMw !== null) partes.push(`Potencia radiativa máxima: ${a.maxFrpMw.toFixed(1)} MW.`);
  partes.push('Requiere verificación: una detección satelital no confirma un incendio.');
  return partes.join(' ');
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Bolivia usa UTC−4 todo el año (sin horario de verano). La etiqueta corta ("14 nov, 10:24") lleva
 * el año solo si no es el año en curso ("5 sep 2008, 13:20").
 */
export function boliviaTime(utc: Date, now = new Date()): { date: string; time: string; label: string } {
  const toLocal = (d: Date) => new Date(d.getTime() - 4 * 3_600_000);
  const local = toLocal(utc);
  const date = local.toISOString().slice(0, 10);
  const time = local.toISOString().slice(11, 16);
  const year = local.getUTCFullYear() === toLocal(now).getUTCFullYear() ? '' : ` ${local.getUTCFullYear()}`;
  return { date, time, label: `${local.getUTCDate()} ${MESES_CORTOS[local.getUTCMonth()]}${year}, ${time}` };
}
