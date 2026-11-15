export interface FuenteTuni {
  label: string;
  route: '/alertas' | '/mapa' | '/historial' | '/metodologia';
  apiPath?: string;
  query?: Record<string, string>;
  section?: string;
}

export interface RespuestaTuni {
  answer: string;
  dataSource: 'tunari_guard' | 'documentation' | 'general_knowledge' | 'unavailable';
  facts?: { label: string; value: string }[];
  source?: FuenteTuni;
}
