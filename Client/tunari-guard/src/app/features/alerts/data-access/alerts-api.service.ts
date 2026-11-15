import { Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import type { AlertEvent, AlertsResult, AlertStatus } from '../alert-event';

@Injectable({ providedIn: 'root' })
export class AlertsApi {
  private readonly url = environment.apiBaseUrl.replace(/\/$/, '') + '/alertas';

  list(params: Record<string, string | number>, signal: AbortSignal) {
    const query = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]));
    return this.request<AlertsResult>(this.url + '?' + query, { signal });
  }

  detail(id: string, signal: AbortSignal) {
    return this.request<AlertEvent>(this.url + '/' + encodeURIComponent(id), { signal });
  }

  update(id: string, status: AlertStatus, note: string) {
    return this.request<AlertEvent>(this.url + '/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    });
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`La API de alertas respondió HTTP ${response.status}.`);
    return response.json() as Promise<T>;
  }
}
