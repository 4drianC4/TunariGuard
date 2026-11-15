import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface MonthlyProjectionItem {
  mes: string;
  dias_simulados: number;
  indice_esperado_modelo: number;
  k_detecciones_por_celda_dia: number;
  esperado_detecciones: number;
  detecciones_generadas: number;
}

export interface MonthlyProjectionResponse {
  simulated: boolean;
  aviso: string;
  items: MonthlyProjectionItem[];
}

export interface MonthlyProjectionFilters {
  desde?: string;
  hasta?: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectionsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '');

  getMonthly(filters: MonthlyProjectionFilters = {}): Observable<MonthlyProjectionResponse> {
    let params = new HttpParams();

    if (filters.desde) params = params.set('desde', filters.desde);
    if (filters.hasta) params = params.set('hasta', filters.hasta);

    return this.http.get<MonthlyProjectionResponse>(
      `${this.apiBaseUrl}/proyeccion/mensual`,
      { params },
    );
  }
}
