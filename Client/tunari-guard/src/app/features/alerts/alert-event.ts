export const ALERT_COLORS = ['#8eaa49', '#526c26', '#e0b111', '#fb8308', '#e94119'] as const;
export const SEVERITY_LEVEL = { Media: 2, Alta: 3, 'Crítica': 4 } as const;
export const MONTHLY_LEVEL = { normal: 0, sin_baseline: null, elevada: 2, alta: 3, muy_alta: 4 } as const;
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

export interface MonthlyContext {
  fecha_corte: string | null;
  items: {
    area_id: string;
    fecha_corte: string;
    nombre_visible: string;
    nivel_alerta: keyof typeof MONTHLY_LEVEL;
    title: string;
    message: string;
    celdas_dia_observadas: number;
    esperado_modelo: number | null;
    satelite_base: string;
  }[];
}
