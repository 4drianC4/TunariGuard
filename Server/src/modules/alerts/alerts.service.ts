import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  ALERT_UPDATED,
  ALERTS_CREATED,
  BATCH_COMPLETED,
  REPLAY_PASS,
  type AlertsCreatedEvent,
  type AlertUpdatedEvent,
  type BatchCompletedEvent,
  type ReplayPassEvent,
} from '../../shared/domain-events.js';
import { AlertsRepository } from './alerts.repository.js';
import type { ListAlertsQuery, MonthlyContextQuery, UpdateAlertBody } from './alerts.schemas.js';
import { SEVERITY_LABELS, STATUS_LABELS, severityFromLabel, statusFromLabel, toAlertDto } from './domain/alert-dto.js';
import { buildAlerts, type AlertModeValue } from './domain/alert-rules.js';
import { monthlyContext } from './domain/monthly-context.js';

/**
 * Alertas operativas: se generan solas cuando entran detecciones (importación o replay), se
 * guardan con su estado de revisión y se anuncian en tiempo real. También traduce a mensaje el
 * nivel_alerta mensual del paquete fuego (contexto, sin tiempo real: cambia como mucho a diario).
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly repository: AlertsRepository,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(BATCH_COMPLETED, { async: true })
  async onBatchCompleted(event: BatchCompletedEvent): Promise<void> {
    if (event.inserted === 0) return;
    await this.generate({ batchId: event.batchId }, 'LIVE');
  }

  @OnEvent(REPLAY_PASS, { async: true })
  async onReplayPass(event: ReplayPassEvent): Promise<void> {
    await this.generate({ observationIds: event.observationIds }, 'REPLAY');
  }

  private async generate(scope: { batchId: string } | { observationIds: string[] }, mode: AlertModeValue): Promise<void> {
    try {
      const useFuego = await this.repository.fuegoAvailable();
      const detections = await this.repository.detections(scope, useFuego);
      const created = await this.repository.insertMany(buildAlerts(detections, mode));
      if (!created.length) return;
      if (mode === 'LIVE') this.logger.log(`${created.length} alertas nuevas (${detections.length} detecciones en áreas vigiladas)`);
      this.events.emit(ALERTS_CREATED, { alerts: created.map(toAlertDto) } satisfies AlertsCreatedEvent);
    } catch (error) {
      // Una falla al generar alertas no debe tumbar la importación ni el replay.
      this.logger.error('No se pudieron generar alertas', error as Error);
    }
  }

  async list(q: ListAlertsQuery) {
    const { rows, total, bySeverity, byStatus, areas } = await this.repository.list(
      {
        // Los días se piden en hora de Bolivia (UTC−4): el día D va de D 04:00Z a D+1 04:00Z.
        fromUtc: q.desde ? new Date(`${q.desde}T04:00:00Z`) : undefined,
        toUtc: q.hasta ? new Date(new Date(`${q.hasta}T04:00:00Z`).getTime() + 86_400_000) : undefined,
        areaId: q.area_id,
        severity: q.severidad ? severityFromLabel(q.severidad) : undefined,
        status: q.estado ? statusFromLabel(q.estado) : undefined,
        mode: q.modo === 'replay' ? 'REPLAY' : q.modo === 'live' ? 'LIVE' : undefined,
        origin: q.origen,
      },
      q.page,
      q.limit,
    );
    return {
      items: rows.map(toAlertDto),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
      /** Conteos sobre el filtro completo (no solo la página): tarjetas de resumen de la vista. */
      counts: {
        critical: bySeverity.CRITICAL ?? 0,
        high: bySeverity.HIGH ?? 0,
        medium: bySeverity.MEDIUM ?? 0,
        byStatus: Object.fromEntries(Object.entries(STATUS_LABELS).map(([k, label]) => [label, byStatus[k as keyof typeof byStatus] ?? 0])),
      },
      areas,
      severities: Object.values(SEVERITY_LABELS),
      statuses: Object.values(STATUS_LABELS),
    };
  }

  async findOne(id: string) {
    const alert = await this.repository.find(id);
    if (!alert) throw new NotFoundException(`No existe la alerta ${id}`);
    return toAlertDto(alert);
  }

  async updateStatus(id: string, body: UpdateAlertBody) {
    const current = await this.repository.find(id);
    if (!current) throw new NotFoundException(`No existe la alerta ${id}`);
    const updated = toAlertDto(await this.repository.updateStatus(current.id, statusFromLabel(body.status), body.note));
    this.events.emit(ALERT_UPDATED, { alert: updated } satisfies AlertUpdatedEvent);
    return updated;
  }

  async deleteDemo() {
    return { deleted: await this.repository.deleteDemo() };
  }

  async monthlyContext(q: MonthlyContextQuery) {
    if (!(await this.repository.fuegoAvailable())) {
      throw new ServiceUnavailableException('El esquema fuego no está cargado. Ejecuta en Server/: npm run fuego:setup');
    }
    const items = (await this.repository.monthly(q.area_id)).map(monthlyContext);
    if (q.area_id && items.length === 0) throw new NotFoundException(`No hay alerta del mes en curso para ${q.area_id}`);
    return {
      fecha_corte: items[0]?.fecha_corte ?? null,
      items: q.solo_alertas ? items.filter((i) => i.isAlert) : items,
    };
  }
}
