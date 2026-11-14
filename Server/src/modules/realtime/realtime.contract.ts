import type { FeatureCollection, Point } from 'geojson';
import type { ObservationFeature } from '../observations/observations.service.js';

/**
 * Contrato Socket.IO con el frontend. Namespace: `/realtime` (p. ej. io('http://localhost:3000/realtime')).
 * Al conectarse, el cliente entra a la sala de todos los distritos y recibe el último
 * `sync:status` y `replay:status`. Copiar estos tipos al frontend mantiene ambos lados alineados.
 */
export const REALTIME_NAMESPACE = 'realtime';

export const ServerEvents = {
  HotspotsNew: 'hotspots:new',
  HotspotsRemoved: 'hotspots:removed',
  SyncStatus: 'sync:status',
  ReplayStatus: 'replay:status',
  DistrictsUpdated: 'districts:updated',
} as const;

export const ClientEvents = {
  /** Cambia las salas: `{ districts: ['distrito-01','distrito-02'] }` o `{}` para recibir todo. Responde con ack. */
  Subscribe: 'subscribe',
} as const;

export const ROOM_ALL = 'all';
export const districtRoom = (code: string) => `district:${code}`;

export interface HotspotsNewPayload {
  /** live: datos recién importados · replay: reproducción histórica de datos ya guardados. */
  mode: 'live' | 'replay';
  /** true si es replay o si el lote se importó como SIMULATED. Mostrarlo en la interfaz. */
  simulated: boolean;
  batchId: string | null;
  dataset: string | null;
  emittedAtUtc: string;
  /** En replay, el instante histórico que se está reproduciendo. */
  simulatedTimeUtc: string | null;
  collection: FeatureCollection<Point, ObservationFeature['properties']>;
}

/**
 * Observaciones que ya no existen: el dato estándar reemplazó a las NRT provisionales. Llega a
 * TODOS los clientes (también a los suscritos a distritos) y antes del `hotspots:new` del lote.
 */
export interface HotspotsRemovedPayload {
  reason: 'nrt_replaced_by_standard';
  batchId: string;
  dataset: string;
  removedIds: string[];
  emittedAtUtc: string;
}

export interface SyncStatusPayload {
  lastBatch: {
    batchId: string;
    dataset: string;
    source: 'CSV' | 'FIRMS_API';
    origin: 'REAL' | 'SIMULATED';
    rowsTotal: number;
    inserted: number;
    duplicates: number;
    rejected: number;
    /** false: importación masiva sin `hotspots:new`; recargar con GET /observations. */
    announced: boolean;
    /** NRT que pasaron a estándar en su lugar. Si > 0, conviene recargar por REST. */
    upgradedToStandard: number;
    /** NRT borradas por el dato estándar. Si > 0 y no llegó `hotspots:removed`, recargar por REST. */
    removedObsolete: number;
    completedAtUtc: string;
  } | null;
}

export interface ReplayStatusPayload {
  running: boolean;
  step: number;
  totalSteps: number;
  intervalMs: number;
  loop: boolean;
  observationCount: number;
  /** true si había más observaciones que el máximo reproducible. */
  truncated: boolean;
  simulatedTimeUtc: string | null;
  startedAtUtc: string | null;
}

export interface DistrictsUpdatedPayload {
  imported: number;
  reassigned: number;
  updatedAtUtc: string;
}

export interface SubscribeAck {
  rooms: string[];
}
