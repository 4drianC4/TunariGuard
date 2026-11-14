import { Injectable, inject } from '@angular/core';
import { auditTime } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RealtimeClientService } from '../../data-access/realtime/realtime-client.service';

const dataOrigin: string = environment.mapDataOrigin;

@Injectable({ providedIn: 'root' })
export class LiveUpdatesService {
  private readonly client = inject(RealtimeClientService);
  readonly enabled = dataOrigin === 'BACKEND';
  readonly status = this.client.status;
  readonly observationsChanged$ = this.client.changes$.pipe(auditTime(250));
  readonly replay$ = this.client.replay$;

  start(): void {
    if (this.enabled) this.client.connect();
  }
}
