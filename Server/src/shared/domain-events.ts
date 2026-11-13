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
  /** Ids de las observaciones nuevas; las duplicadas no se vuelven a anunciar. */
  insertedIds: string[];
  completedAtUtc: string;
}

export const DISTRICTS_UPDATED = 'districts.updated';

export interface DistrictsUpdatedEvent {
  imported: number;
  /** Las asignaciones cambiaron: el frontend debe recargar distritos y observaciones. */
  reassigned: number;
  updatedAtUtc: string;
}
