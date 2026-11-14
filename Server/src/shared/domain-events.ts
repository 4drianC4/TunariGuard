/**
 * Eventos de dominio dentro del proceso (@nestjs/event-emitter). Los emite el módulo dueño
 * del cambio; los consumen tiempo real y, más adelante, alertas. Solo llevan datos planos.
 */

export const BATCH_COMPLETED = 'ingestion.batch-completed';

export interface BatchCompletedEvent {
  batchId: string;
  dataset: string;
  source: 'CSV' | 'FIRMS_API';
  origin: 'REAL' | 'SIMULATED';
  rowsTotal: number;
  inserted: number;
  duplicates: number;
  rejected: number;
  /**
   * Ids de las observaciones nuevas; las duplicadas no se vuelven a anunciar. Vacío si
   * `announced` es false.
   */
  insertedIds: string[];
  /**
   * false en importaciones masivas (más focos nuevos de los que conviene empujar por socket):
   * los clientes deben recargar con GET /observations en lugar de esperar `hotspots:new`.
   */
  announced: boolean;
  /** Filas NRT existentes que pasaron a dato estándar en su lugar (mismo id; cambian sus datos). */
  upgradedToStandard: number;
  /** Filas NRT borradas porque el dato estándar las dejó obsoletas. */
  removedObsolete: number;
  /** Ids de esas filas borradas, para quitarlas del mapa. Vacío si son demasiadas (ver removedObsolete). */
  removedIds: string[];
  completedAtUtc: string;
}

export const DISTRICTS_UPDATED = 'districts.updated';

export interface DistrictsUpdatedEvent {
  imported: number;
  /** Las asignaciones cambiaron: el frontend debe recargar distritos y observaciones. */
  reassigned: number;
  updatedAtUtc: string;
}

export const REPLAY_PASS = 'replay.pass';

/** Una pasada emitida por la reproducción histórica (para generar alertas de demostración). */
export interface ReplayPassEvent {
  observationIds: string[];
}

export const ALERTS_CREATED = 'alerts.created';
export const ALERT_UPDATED = 'alerts.updated';

/** Alertas operativas nuevas (ya con la forma del DTO público). */
export interface AlertsCreatedEvent {
  alerts: unknown[];
}

/** Una alerta cambió de estado. */
export interface AlertUpdatedEvent {
  alert: unknown;
}
