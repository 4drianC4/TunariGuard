import { t } from '../../shared/i18n/language.js';
import { BadRequestException, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REPLAY_PASS, type ReplayPassEvent } from '../../shared/domain-events.js';
import { ObservationsService, type ObservationFeature } from '../observations/observations.service.js';
import type { ReplayStatusPayload } from '../realtime/realtime.contract.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { groupIntoPasses, type Pass } from './domain/group-passes.js';
import type { StartReplayBody } from './replay.schemas.js';

/** Máximo de observaciones cargadas en memoria para una reproducción. */
const MAX_OBSERVATIONS = 20_000;

const IDLE: ReplayStatusPayload = {
  running: false,
  step: 0,
  totalSteps: 0,
  intervalMs: 0,
  loop: false,
  observationCount: 0,
  truncated: false,
  simulatedTimeUtc: null,
  startedAtUtc: null,
};

/**
 * Reproduce observaciones ya guardadas como si llegaran en vivo, una pasada satelital por
 * intervalo. No escribe observaciones: emite `hotspots:new` con mode=replay y simulated=true, y un
 * evento replay.pass para que el módulo de alertas genere alertas de demostración (mode=REPLAY).
 * Hay una sola reproducción a la vez para todos los clientes.
 */
@Injectable()
export class ReplayService implements OnModuleDestroy {
  private readonly logger = new Logger(ReplayService.name);
  private timer: NodeJS.Timeout | null = null;
  private passes: Pass<ObservationFeature>[] = [];
  private state: ReplayStatusPayload = IDLE;

  constructor(
    private readonly observations: ObservationsService,
    private readonly publisher: RealtimePublisher,
    private readonly events: EventEmitter2,
  ) {}

  async start(body: StartReplayBody): Promise<ReplayStatusPayload> {
    const features = await this.observations.chronologicalFeatures(body, MAX_OBSERVATIONS + 1);
    if (features.length === 0) {
      throw new BadRequestException(t('No hay observaciones que reproducir con esos filtros'));
    }
    const truncated = features.length > MAX_OBSERVATIONS;
    this.stopTimer();
    this.passes = groupIntoPasses(features.slice(0, MAX_OBSERVATIONS), body.passWindowMinutes);
    this.state = {
      running: true,
      step: 0,
      totalSteps: this.passes.length,
      intervalMs: body.intervalMs,
      loop: body.loop,
      observationCount: Math.min(features.length, MAX_OBSERVATIONS),
      truncated,
      simulatedTimeUtc: null,
      startedAtUtc: new Date().toISOString(),
    };
    this.logger.log(`Replay: ${this.state.observationCount} observaciones en ${this.passes.length} pasadas`);

    this.tick();
    this.timer = setInterval(() => this.tick(), body.intervalMs);
    return this.state;
  }

  stop(): ReplayStatusPayload {
    if (this.state.running) this.finish();
    return this.state;
  }

  status(): ReplayStatusPayload {
    return this.state;
  }

  onModuleDestroy(): void {
    this.stopTimer();
  }

  private tick(): void {
    if (this.state.step >= this.passes.length) {
      if (!this.state.loop) return this.finish();
      this.state = { ...this.state, step: 0 };
    }
    const pass = this.passes[this.state.step];
    if (!pass) return this.finish();

    this.publisher.publishHotspots(pass.features, {
      mode: 'replay',
      simulated: true,
      batchId: null,
      dataset: null,
      simulatedTimeUtc: pass.simulatedTimeUtc,
    });
    this.events.emit(REPLAY_PASS, {
      observationIds: pass.features.map((f) => String(f.id ?? f.properties.id)),
    } satisfies ReplayPassEvent);
    this.state = { ...this.state, step: this.state.step + 1, simulatedTimeUtc: pass.simulatedTimeUtc };
    this.publisher.publishReplayStatus(this.state);
  }

  private finish(): void {
    this.stopTimer();
    this.state = { ...this.state, running: false };
    this.publisher.publishReplayStatus(this.state);
    this.logger.log('Replay detenido');
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
