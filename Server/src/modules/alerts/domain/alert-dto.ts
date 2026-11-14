import { boliviaTime, platformName, type Severity } from './alert-rules.js';

export type AlertStatusValue = 'PENDING' | 'IN_REVIEW' | 'IN_ANALYSIS' | 'VERIFIED';

/** Etiquetas que usa la vista /alertas del frontend. */
export const SEVERITY_LABELS: Record<Severity, 'Crítica' | 'Alta' | 'Media'> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  MEDIUM: 'Media',
};
export const STATUS_LABELS: Record<AlertStatusValue, 'Pendiente' | 'En revisión' | 'En análisis' | 'Verificada'> = {
  PENDING: 'Pendiente',
  IN_REVIEW: 'En revisión',
  IN_ANALYSIS: 'En análisis',
  VERIFIED: 'Verificada',
};
const CONFIDENCE_LABELS = { HIGH: 'Alta', NOMINAL: 'Nominal', LOW: 'Baja' } as const;

export type SeverityLabel = (typeof SEVERITY_LABELS)[Severity];
export type StatusLabel = (typeof STATUS_LABELS)[AlertStatusValue];

export function severityFromLabel(label: SeverityLabel): Severity {
  return (Object.keys(SEVERITY_LABELS) as Severity[]).find((k) => SEVERITY_LABELS[k] === label)!;
}
export function statusFromLabel(label: StatusLabel): AlertStatusValue {
  return (Object.keys(STATUS_LABELS) as AlertStatusValue[]).find((k) => STATUS_LABELS[k] === label)!;
}

export interface AlertRecord {
  id: string;
  number: number;
  mode: 'LIVE' | 'REPLAY';
  origin: 'REAL' | 'SIMULATED';
  severity: Severity;
  status: AlertStatusValue;
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
  confidenceLevel: 'LOW' | 'NOMINAL' | 'HIGH' | null;
  confidenceRaw: string | null;
  message: string;
  note: string | null;
  observationIds: string[];
  batchId: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Forma compatible con AlertEvent de la vista /alertas (id, district, severity, status, detected,
 * date, time, source, confidence, lat, lng) más campos de contexto.
 */
export function toAlertDto(a: AlertRecord) {
  const local = boliviaTime(a.detectedAt);
  const confidence = a.sensor === 'MODIS' && a.confidenceRaw !== null && /^\d+$/.test(a.confidenceRaw) ? Number(a.confidenceRaw) : null;
  return {
    id: `AL-${String(a.number).padStart(4, '0')}`,
    uuid: a.id,
    district: a.areaName,
    areaId: a.areaId,
    inPark: a.inPark,
    severity: SEVERITY_LABELS[a.severity],
    status: STATUS_LABELS[a.status],
    detected: local.label,
    date: local.date,
    time: local.time,
    detectedAtUtc: a.detectedAt.toISOString(),
    source: `${a.sensor} (NASA)`,
    satellite: platformName(a.platform),
    /** Porcentaje solo en MODIS (0–100). VIIRS no da porcentaje: ver confidenceLevel. */
    confidence,
    confidenceLevel: a.confidenceLevel ? CONFIDENCE_LABELS[a.confidenceLevel] : null,
    lat: a.latitude,
    lng: a.longitude,
    detectionCount: a.detectionCount,
    maxFrpMw: a.maxFrpMw,
    message: a.message,
    note: a.note,
    mode: a.mode === 'REPLAY' ? ('replay' as const) : ('live' as const),
    origin: a.origin,
    /** Mostrar la etiqueta "simulado": replay o datos de demostración. */
    simulated: a.mode === 'REPLAY' || a.origin === 'SIMULATED',
    observationIds: a.observationIds,
    batchId: a.batchId,
    statusChangedAtUtc: a.statusChangedAt?.toISOString() ?? null,
    createdAtUtc: a.createdAt.toISOString(),
  };
}

export type AlertDto = ReturnType<typeof toAlertDto>;
