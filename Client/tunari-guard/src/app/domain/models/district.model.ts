/** Área devuelta por GET /api/v1/areas?tipo=distrito&formato=json. */
export interface District {
  readonly tipo: 'distrito';
  readonly codigo: string;
  readonly nombre: string;
  readonly area_id: string;
  readonly area_km2: number;
  readonly es_oficial: boolean;
  readonly advertencia: string | null;
  readonly detecciones: number;
  readonly fuente_limite: string;
  readonly metodo_indice: string;
  readonly origen_factor: string;
  readonly padre_area_id: string | null;
  readonly nombre_visible: string;
  readonly validacion_local: string;
  readonly metodo_derivacion: string;
  readonly area_en_parque_km2: number;
  readonly alcance_estadistico: string;
  readonly comparabilidad_pre_2012: string;
  readonly redistribucion_autorizada: string;
  readonly geometria_original_oficial: boolean;
}
