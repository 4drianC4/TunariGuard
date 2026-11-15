import type { ContextoDetecciones } from './tuni.schemas.js';
import type { PeriodoIncendios } from './tuni-fechas.js';

export interface FuenteTuni {
  label: string;
  route: '/alertas' | '/mapa' | '/historial' | '/metodologia';
  apiPath?: string;
  query?: Record<string, string>;
}

export interface CitaTuni {
  id: string;
  titulo: string;
  texto: string;
  alcance?: string;
}

export interface RespuestaTuni {
  answer: string;
  dataSource: 'tunari_guard' | 'documentation' | 'general_knowledge' | 'unavailable';
  facts?: { label: string; value: string }[];
  source?: FuenteTuni;
  citas?: CitaTuni[];
  contextoDetecciones?: ContextoDetecciones;
  periodosIncendios?: PeriodoIncendios[];
}
