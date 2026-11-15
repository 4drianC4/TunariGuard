import { Injectable, NotFoundException } from '@nestjs/common';
import type { Feature, Point } from 'geojson';
import type { DataOrigin, NormalizedObservation } from '../ingestion/domain/normalized-observation.js';
import {
  ObservationsRepository,
  type AssignmentSummary,
  type ChronologicalFilter,
  type InsertResult,
  type NrtRange,
  type ObservationRecord,
} from './observations.repository.js';
import type { ListObservationsQuery } from './observations.schemas.js';

export type ObservationDto = ReturnType<typeof toDto>;
export type ObservationFeature = Feature<Point, Omit<ObservationDto, 'position'>>;

/** Capacidad pública del módulo: registrar lotes, asignar distritos y consultar. */
@Injectable()
export class ObservationsService {
  constructor(private readonly repository: ObservationsRepository) {}

  /** Inserta un bloque de un lote: ids nuevos y cuántas NRT pasaron a estándar. */
  insertChunk(batchId: string, origin: DataOrigin, observations: NormalizedObservation[]): Promise<InsertResult> {
    return this.repository.insertMany(batchId, origin, observations);
  }

  /**
   * Quita las NRT que el dato estándar del lote deja obsoletas (misma plataforma, origen, días y
   * zona). Devuelve los ids borrados para avisar al mapa.
   */
  deleteObsoleteNrt(batchId: string, origin: DataOrigin, ranges: NrtRange[]): Promise<string[]> {
    return ranges.length ? this.repository.deleteObsoleteNrt(batchId, origin, ranges) : Promise.resolve([]);
  }

  /** Cuenta (y con `aplicar` borra) las observaciones simuladas hasta un día de Bolivia. */
  simulatedUpTo(hasta: string | null, aplicar: boolean) {
    return this.repository.simulatedUpTo(hasta, aplicar);
  }

  /** Observaciones simuladas cuya fecha se cumplió entre dos instantes. */
  simulatedArrivedBetween(desde: Date, hasta: Date): Promise<string[]> {
    return this.repository.simulatedArrivedBetween(desde, hasta);
  }

  /** Asigna distritos a todo un lote, una vez insertados todos sus bloques. */
  assignBatchDistricts(batchId: string): Promise<AssignmentSummary> {
    return this.repository.assignDistricts(batchId);
  }

  /** Recalcula la asignación de todas las observaciones (tras cambiar los distritos). */
  assignDistricts(): Promise<AssignmentSummary> {
    return this.repository.assignDistricts();
  }

  async list(query: ListObservationsQuery) {
    const rows = await this.repository.findMany(query);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (page.at(-1)?.id ?? null) : null;

    if (query.format === 'geojson') {
      return { type: 'FeatureCollection' as const, features: page.map(toFeature), nextCursor };
    }
    return { items: page.map(toDto), nextCursor };
  }

  async findOne(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException(`Observación ${id} no encontrada`);
    return { ...toDto(row), raw: row.raw };
  }

  /** Features GeoJSON de observaciones concretas (p. ej. las recién insertadas). */
  async featuresByIds(ids: string[]): Promise<ObservationFeature[]> {
    return (await this.repository.findByIds(ids)).map(toFeature);
  }

  /** Features en orden cronológico, para reproducción histórica. */
  async chronologicalFeatures(filter: ChronologicalFilter, max: number): Promise<ObservationFeature[]> {
    return (await this.repository.findChronological(filter, max)).map(toFeature);
  }
}

/** Forma compatible con SatelliteObservation del frontend, más campos de trazabilidad. */
function toDto(o: ObservationRecord) {
  return {
    id: o.id,
    sensor: o.sensor,
    platform: o.platform,
    position: { lat: o.latitude, lng: o.longitude },
    acquiredAtUtc: o.acquiredAt.toISOString(),
    confidenceRaw: o.confidenceRaw,
    confidenceLevel: o.confidenceLevel,
    brightnessKelvin: o.brightnessK,
    brightnessAuxKelvin: o.brightnessAuxK,
    frpMw: o.frpMw,
    scan: o.scan,
    track: o.track,
    dayNight: o.dayNight,
    productVersion: o.productVersion,
    detectionType: o.detectionType,
    source: sourceOf(o),
    dataset: o.batch.dataset,
    batchId: o.batchId,
    districtAssignment: o.districtAssignment,
    district: o.district,
  };
}

function toFeature(o: ObservationRecord): ObservationFeature {
  const { position, ...properties } = toDto(o);
  return {
    type: 'Feature',
    id: properties.id,
    geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
    properties,
  };
}

function sourceOf(o: ObservationRecord): 'NASA_FIRMS' | 'IMPORTED' | 'SIMULATED' {
  if (o.origin === 'SIMULATED') return 'SIMULATED';
  return o.batch.source === 'FIRMS_API' ? 'NASA_FIRMS' : 'IMPORTED';
}
