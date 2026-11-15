import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import type { AlertEvent } from '../../features/alerts/alert-event';
import type { ObservationFeatureProperties } from '../../features/map/models/observation.model';

interface ReplayFrame {
  mode: 'live' | 'replay';
  simulatedTimeUtc: string | null;
  collection: {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: ObservationFeatureProperties;
    }>;
  };
}

interface AlertNotificationsPayload {
  emittedAtUtc: string;
  alerts: Array<Pick<AlertEvent, 'id' | 'district' | 'severity' | 'message' | 'simulated'>>;
}

interface ServerEvents {
  'sync:status': (payload: { lastBatch: { batchId: string } | null }) => void;
  'districts:updated': () => void;
  'hotspots:new': (payload: ReplayFrame) => void;
  'alert:new': () => void;
  'alert:notifications': (payload: AlertNotificationsPayload) => void;
  'alert:updated': () => void;
  'alert:removed': (payload: { alertIds: string[] }) => void;
  'replay:status': (payload: { running: boolean }) => void;
}

@Injectable({ providedIn: 'root' })
export class RealtimeClientService {
  private readonly socket: Socket<ServerEvents> = io(
    new URL('/realtime', new URL(environment.apiBaseUrl, inject(DOCUMENT).baseURI)).href,
    { autoConnect: false },
  );
  private readonly connection = signal<'connecting' | 'connected' | 'offline'>('connecting');
  private readonly changes = new Subject<void>();
  private readonly alertChanges = new Subject<void>();
  private readonly alertNotifications = new Subject<AlertNotificationsPayload>();
  private readonly removedAlerts = new Subject<string[]>();
  private readonly replay = new Subject<ReplayFrame | null>();
  private lastBatchId?: string;

  readonly status = this.connection.asReadonly();
  readonly changes$ = this.changes.asObservable();
  readonly alertChanges$ = this.alertChanges.asObservable();
  readonly alertNotifications$ = this.alertNotifications.asObservable();
  readonly removedAlerts$ = this.removedAlerts.asObservable();
  readonly replay$ = this.replay.asObservable();

  constructor() {
    this.socket.on('connect', () => {
      this.connection.set('connected');
      // Recover changes missed before the connection was ready or while offline.
      this.changes.next();
      this.alertChanges.next();
    });
    this.socket.on('connect_error', () => this.connection.set('offline'));
    this.socket.on('disconnect', () => {
      this.connection.set('offline');
      this.replay.next(null);
    });
    this.socket.on('sync:status', ({ lastBatch }) => {
      if (!lastBatch || lastBatch.batchId === this.lastBatchId) return;
      this.lastBatchId = lastBatch.batchId;
      // A standard batch can replace or remove NRT records without inserting new IDs.
      this.changes.next();
    });
    this.socket.on('districts:updated', () => this.changes.next());
    this.socket.on('hotspots:new', (frame) => {
      if (frame.mode === 'replay') this.replay.next(frame);
    });
    this.socket.on('alert:new', () => this.alertChanges.next());
    this.socket.on('alert:notifications', (payload) => this.alertNotifications.next(payload));
    this.socket.on('alert:updated', () => this.alertChanges.next());
    // Alertas simuladas que dejan de existir al llegar datos reales.
    this.socket.on('alert:removed', ({ alertIds }) => {
      this.removedAlerts.next(alertIds);
      this.alertChanges.next();
    });
    this.socket.on('replay:status', (status) => {
      if (!status.running) this.replay.next(null);
    });
    inject(DestroyRef).onDestroy(() => {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.changes.complete();
      this.alertChanges.complete();
      this.alertNotifications.complete();
      this.removedAlerts.complete();
      this.replay.complete();
    });
  }

  connect(): void {
    this.socket.connect();
  }
}
