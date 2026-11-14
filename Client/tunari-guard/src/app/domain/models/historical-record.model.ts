import { DataOrigin } from '../enums/data-origin.enum';

export type HistorySource = 'HARMONIZED' | 'MODIS' | 'VIIRS';
export type HistoryMeasure = 'celdas_dia' | 'detecciones' | '';

export interface HistoricalRecord {
  readonly year: number;
  readonly month: number;
  readonly source: HistorySource;
  readonly activityCount: number;
  readonly origin: DataOrigin;
  readonly quality: string;
}

export interface HistorySummary {
  readonly total: number;
  readonly monthsWithData: number;
  readonly monthlyAverage: number;
  readonly peak: {
    readonly year: number;
    readonly month: number;
    readonly activityCount: number;
  } | null;
}

export interface HistoryArea {
  readonly tipo: string;
  readonly area_id: string;
  readonly metodo_indice: string;
  readonly nombre_visible: string;
}

export interface HistoryApiRecord {
  readonly year: number;
  readonly month: number;
  readonly source: HistorySource;
  readonly activityCount: number;
  readonly origin: string;
  readonly quality: string;
}

export interface HistoryApiResponse {
  readonly area: HistoryArea;
  readonly source: HistorySource;
  readonly unit: string;
  readonly notice: string;
  readonly summary: HistorySummary;
  readonly records: readonly HistoryApiRecord[];
}
