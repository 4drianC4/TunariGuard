import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  HistoryApiResponse,
  HistoryMeasure,
  HistorySource,
} from '../../domain/models/historical-record.model';

export interface HistoryFilters {
  readonly areaId: string;
  readonly source: HistorySource;
  readonly measure: HistoryMeasure;
  readonly fromYear?: number | null;
  readonly toYear?: number | null;
}

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

  getHistory(filters: HistoryFilters): Observable<HistoryApiResponse> {
    let params = new HttpParams()
      .set('area_id', filters.areaId)
      .set('fuente', filters.source);

    if (filters.measure) {
      params = params.set('medida', filters.measure);
    }

    if (filters.fromYear !== null && filters.fromYear !== undefined) {
      params = params.set('desde_anio', String(filters.fromYear));
    }
    if (filters.toYear !== null && filters.toYear !== undefined) {
      params = params.set('hasta_anio', String(filters.toYear));
    }

    return this.http.get<HistoryApiResponse>(`${this.apiBaseUrl}/historial`, { params });
  }
}
