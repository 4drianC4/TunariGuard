import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { AlertDto } from '../alerts/domain/alert-dto.js';
import {
  ALERT_UPDATED,
  ALERTS_CREATED,
  BATCH_COMPLETED,
  DISTRICTS_UPDATED,
  type AlertsCreatedEvent,
  type AlertUpdatedEvent,
  type BatchCompletedEvent,
  type DistrictsUpdatedEvent,
} from '../../shared/domain-events.js';
import { ObservationsService, type ObservationFeature } from '../observations/observations.service.js';
import { chunk, fanOutByDistrict } from './domain/fan-out.js';
import {
  ServerEvents,
  type AlertNewPayload,
  type AlertUpdatedPayload,
  type DistrictsUpdatedPayload,
  type HotspotsNewPayload,
  type HotspotsRemovedPayload,
  type ReplayStatusPayload,
  type SyncStatusPayload,
} from './realtime.contract.js';
import { RealtimeGateway } from './realtime.gateway.js';

/** Features por mensaje; un lote grande se envía en varios `hotspots:new`. */
const FEATURES_PER_MESSAGE = 500;
const IDS_PER_QUERY = 1000;
/** Alertas completas por mensaje `alert:new`; el resto se cuenta en `count`. */
const MAX_ALERTS_PER_MESSAGE = 100;
/** Ids por mensaje `hotspots:removed`. */
const REMOVED_IDS_PER_MESSAGE = 1000;

type HotspotsMeta = Omit<HotspotsNewPayload, 'collection' | 'emittedAtUtc'>;

/** Traduce eventos de dominio en mensajes Socket.IO. Capacidad pública del módulo. */
@Injectable()
export class RealtimePublisher {
  private readonly logger = new Logger(RealtimePublisher.name);

  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly observations: ObservationsService,
  ) {}

  @OnEvent(BATCH_COMPLETED, { async: true })
  async onBatchCompleted(event: BatchCompletedEvent): Promise<void> {
    try {
      const { insertedIds, removedIds, ...lastBatch } = event;

      // Primero lo que se quitó, para que el mapa no muestre a la vez la NRT y su reemplazo.
      const emittedAtUtc = new Date().toISOString();
      for (const ids of chunk(removedIds, REMOVED_IDS_PER_MESSAGE)) {
        this.gateway.emitToAll(ServerEvents.HotspotsRemoved, {
          reason: 'nrt_replaced_by_standard',
          batchId: event.batchId,
          dataset: event.dataset,
          removedIds: ids,
          emittedAtUtc,
        } satisfies HotspotsRemovedPayload);
      }

      this.gateway.emitSticky(ServerEvents.SyncStatus, { lastBatch } satisfies SyncStatusPayload);

      for (const ids of chunk(insertedIds, IDS_PER_QUERY)) {
        const features = await this.observations.featuresByIds(ids);
        this.publishHotspots(features, {
          mode: 'live',
          simulated: event.origin === 'SIMULATED',
          batchId: event.batchId,
          dataset: event.dataset,
          simulatedTimeUtc: null,
        });
      }
      this.gateway.logSummary(
        event.announced
          ? `Lote ${event.batchId}: ${insertedIds.length} focos nuevos anunciados, ${removedIds.length} quitados`
          : `Lote ${event.batchId}: importación masiva (${event.inserted} focos), solo sync:status`,
      );
    } catch (error) {
      this.logger.error(`No se pudo anunciar el lote ${event.batchId}`, error as Error);
    }
  }

  @OnEvent(DISTRICTS_UPDATED)
  onDistrictsUpdated(event: DistrictsUpdatedEvent): void {
    this.gateway.emitToAll(ServerEvents.DistrictsUpdated, event satisfies DistrictsUpdatedPayload);
  }

  @OnEvent(ALERTS_CREATED)
  onAlertsCreated(event: AlertsCreatedEvent): void {
    const alerts = event.alerts as AlertDto[];
    this.gateway.emitToAll(ServerEvents.AlertNew, {
      count: alerts.length,
      // Las más recientes primero, como la lista de la vista.
      alerts: [...alerts].reverse().slice(0, MAX_ALERTS_PER_MESSAGE),
      truncated: alerts.length > MAX_ALERTS_PER_MESSAGE,
      emittedAtUtc: new Date().toISOString(),
    } satisfies AlertNewPayload);
  }

  @OnEvent(ALERT_UPDATED)
  onAlertUpdated(event: AlertUpdatedEvent): void {
    this.gateway.emitToAll(ServerEvents.AlertUpdated, {
      alert: event.alert as AlertDto,
      emittedAtUtc: new Date().toISOString(),
    } satisfies AlertUpdatedPayload);
  }

  publishHotspots(features: ObservationFeature[], meta: HotspotsMeta): void {
    const emittedAtUtc = new Date().toISOString();
    for (const [room, roomFeatures] of fanOutByDistrict(features)) {
      for (const part of chunk(roomFeatures, FEATURES_PER_MESSAGE)) {
        this.gateway.emitToRoom(room, ServerEvents.HotspotsNew, {
          ...meta,
          emittedAtUtc,
          collection: { type: 'FeatureCollection', features: part },
        } satisfies HotspotsNewPayload);
      }
    }
  }

  publishReplayStatus(status: ReplayStatusPayload): void {
    this.gateway.emitSticky(ServerEvents.ReplayStatus, status);
  }
}
