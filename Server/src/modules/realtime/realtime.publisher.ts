import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  BATCH_COMPLETED,
  DISTRICTS_UPDATED,
  type BatchCompletedEvent,
  type DistrictsUpdatedEvent,
} from '../../shared/domain-events.js';
import { ObservationsService, type ObservationFeature } from '../observations/observations.service.js';
import { chunk, fanOutByDistrict } from './domain/fan-out.js';
import {
  ServerEvents,
  type DistrictsUpdatedPayload,
  type HotspotsNewPayload,
  type ReplayStatusPayload,
  type SyncStatusPayload,
} from './realtime.contract.js';
import { RealtimeGateway } from './realtime.gateway.js';

/** Features por mensaje; un lote grande se envía en varios `hotspots:new`. */
const FEATURES_PER_MESSAGE = 500;
const IDS_PER_QUERY = 1000;

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
      const { insertedIds, ...lastBatch } = event;
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
      this.gateway.logSummary(`Lote ${event.batchId}: ${insertedIds.length} focos nuevos anunciados`);
    } catch (error) {
      this.logger.error(`No se pudo anunciar el lote ${event.batchId}`, error as Error);
    }
  }

  @OnEvent(DISTRICTS_UPDATED)
  onDistrictsUpdated(event: DistrictsUpdatedEvent): void {
    this.gateway.emitToAll(ServerEvents.DistrictsUpdated, event satisfies DistrictsUpdatedPayload);
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
