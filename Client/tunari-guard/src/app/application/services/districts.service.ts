import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { District } from '../../domain/models/district.model';

@Injectable({ providedIn: 'root' })
export class DistrictsService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl.replace(/\/$/, '').replace(/\/api\/v1$/, '') + '/api/v1';

  getDistricts(): Observable<readonly District[]> {
    const params = new HttpParams()
      .set('formato', 'json');

    return this.http.get<readonly District[]>(`${this.apiBaseUrl}/areas`, { params });
  }
}
