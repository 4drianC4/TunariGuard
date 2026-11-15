export const ALERT_COLORS = ['#8eaa49', '#526c26', '#e0b111', '#fb8308', '#e94119'] as const;
export const SEVERITY_LEVEL = { Media: 2, Alta: 3, 'Crítica': 4 } as const;
export type AlertSeverity = keyof typeof SEVERITY_LEVEL;
export type AlertStatus = 'Pendiente' | 'En revisión' | 'En análisis' | 'Verificada';

export interface AlertEvent {
  id: string;
  uuid: string;
  district: string;
  areaId: string;
  inPark: boolean;
  severity: AlertSeverity;
  status: AlertStatus;
  detectedAtUtc: string;
  source: string;
  satellite: string;
  confidence: number | null;
  confidenceLevel: string | null;
  lat: number;
  lng: number;
  detectionCount: number;
  maxFrpMw: number | null;
  message: string;
  messageByLanguage?: { es: string; en: string };
  districtByLanguage?: { es: string; en: string };
  note: string | null;
  simulated: boolean;
  mode: 'live' | 'replay';
  statusChangedAtUtc: string | null;
}

export interface AlertsResult {
  items: AlertEvent[];
  total: number;
  page: number;
  pages: number;
  counts: { critical: number; high: number; medium: number; byStatus: Record<AlertStatus, number> };
  areas: { areaId: string; areaName: string; count: number }[];
  severities: AlertSeverity[];
  statuses: AlertStatus[];
}
