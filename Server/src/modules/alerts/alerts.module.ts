import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller.js';
import { AlertsRepository } from './alerts.repository.js';
import { AlertsService } from './alerts.service.js';

/**
 * Alertas operativas (generadas desde las detecciones y guardadas con su estado) y el contexto
 * mensual del paquete fuego. Se comunica con el resto solo por eventos de dominio: escucha
 * ingestion.batch-completed y replay.pass, y emite alerts.created / alerts.updated, que el
 * módulo de tiempo real traduce a Socket.IO.
 */
@Module({
  controllers: [AlertsController],
  providers: [AlertsService, AlertsRepository],
})
export class AlertsModule {}
