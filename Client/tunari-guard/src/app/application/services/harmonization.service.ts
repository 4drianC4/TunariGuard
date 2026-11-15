import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AnalysisArea {
  readonly area_id: string;
  readonly tipo: 'parque' | 'municipio' | 'distrito' | 'municipio_parque' | 'personalizada';
  readonly nombre_visible: string;
  readonly nombre?: string;
  readonly advertencia?: string | null;
}

export interface AnalysisEvent {
  readonly evento_id: string;
  readonly area_id: string | null;
  readonly fecha_inicio: string;
  readonly fecha_fin: string;
  readonly detecciones: number;
  readonly celdas_1km: number;
  readonly frp_suma_mw: number | null;
  readonly frp_max_mw: number | null;
  readonly duracion_dias: number;
  readonly es_multisensor: boolean;
  readonly fuentes: string;
}

@Injectable({ providedIn: 'root' })
export class HarmonizationService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

  getAreas(): Observable<readonly AnalysisArea[]> {
    return this.http.get<readonly AnalysisArea[]>(`${this.apiBaseUrl}/areas`, {
      params: new HttpParams().set('formato', 'json'),
    });
  }

  getEvents(filters: {
    areaId: string;
    from: string;
    to: string;
    limit?: number;
  }): Observable<readonly AnalysisEvent[]> {
    const params = new HttpParams()
      .set('area_id', filters.areaId)
      .set('desde', filters.from)
      .set('hasta', filters.to)
      .set('limite', String(filters.limit ?? 100))
      .set('offset', '0');

    return this.http.get<readonly AnalysisEvent[]>(`${this.apiBaseUrl}/eventos`, { params });
  }
}
