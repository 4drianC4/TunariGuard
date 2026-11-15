import { LanguageService } from '../../../core/i18n/language.service';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import type { AlertEvent, AlertsResult, AlertSeverity, AlertStatus } from '../alert-event';

const severityCodes: Record<AlertSeverity, string> = { 'Crítica': 'CRITICAL', Alta: 'HIGH', Media: 'MEDIUM' };
const statusCodes: Record<AlertStatus, string> = {
  Pendiente: 'PENDING', 'En revisión': 'IN_REVIEW', 'En análisis': 'IN_ANALYSIS', Verificada: 'VERIFIED',
};

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly i18n = inject(LanguageService);
  private readonly url = environment.apiBaseUrl.replace(/\/$/, '') + '/alertas';

  list(params: Record<string, string | number>, signal: AbortSignal) {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    const severity = severityCodes[params['severidad'] as AlertSeverity];
    const status = statusCodes[params['estado'] as AlertStatus];
    if (severity) query.set('severidad', severity);
    if (status) query.set('estado', status);
    return this.request<AlertsResult>(this.url + '?' + query, { signal });
  }

  detail(id: string, signal: AbortSignal) {
    return this.request<AlertEvent>(this.url + '/' + encodeURIComponent(id), { signal });
  }

  update(id: string, status: AlertStatus, note: string) {
    return this.request<AlertEvent>(this.url + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: statusCodes[status], note }),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await this.i18n.fetch(url, init);
    if (!response.ok) {
      throw new Error(this.i18n.text('La API de alertas respondió HTTP {code}.', { code: response.status }));
    }
    return response.json() as Promise<T>;
  }
}
