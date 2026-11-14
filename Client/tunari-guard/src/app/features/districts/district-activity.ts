import type { Observation } from '../map/models/observation.model';

export const ACTIVITY = [
  { level: 'Sin actividad', range: '0', color: '#8eaa49', minimum: 0 },
  { level: 'Bajo', range: '1–3', color: '#526c26', minimum: 1 },
  { level: 'Medio', range: '4–6', color: '#e0b111', minimum: 4 },
  { level: 'Alto', range: '7 o más', color: '#e94119', minimum: 7 },
] as const;

export interface DistrictActivity {
  id: string;
  name: string;
  provisional: boolean;
  areaKm2: number | null;
  boundarySource: string | null;
  count: number;
  delta: number;
  risk: typeof ACTIVITY[number]['level'];
  color: string;
  history: number[];
  sources: string;
  observations: readonly Observation[];
  last: string | null;
}
