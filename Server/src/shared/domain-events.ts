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

export const OBSERVATIONS_ARRIVED = 'observations.arrived';

/**
 * Observaciones simuladas (proyección) cuya fecha y hora ya se cumplió: se anuncian como si
 * acabaran de llegar. Los datos reales no pasan por aquí (se anuncian al importarse).
 */
export interface ObservationsArrivedEvent {
  observationIds: string[];
}

export const SIMULATED_REMOVED = 'observations.simulated-removed';

/** Se borraron observaciones simuladas (reemplazo por datos reales o limpieza). */
export interface SimulatedRemovedEvent {
  observationIds: string[];
  /** Último día (hora de Bolivia) borrado; null si se borraron todas. */
  hasta: string | null;
}

export const ALERTS_REMOVED = 'alerts.removed';

/** Alertas borradas (las de observaciones simuladas que ya no existen). */
export interface AlertsRemovedEvent {
  /** Códigos AL-0001 (el `id` del DTO de alertas). */
  alertIds: string[];
  uuids: string[];
}
