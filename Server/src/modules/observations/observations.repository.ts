import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { DataOrigin, NormalizedObservation } from '../ingestion/domain/normalized-observation.js';
import type { ListObservationsQuery } from './observations.schemas.js';

const INSERT_CHUNK = 1000;

export interface AssignmentSummary {
  evaluated: number;
  assigned: number;
  outside: number;
  ambiguous: number;
}

const observationInclude = {
  district: { select: { code: true, name: true, provisional: true } },
  batch: { select: { source: true, dataset: true } },
} satisfies Prisma.ObservationInclude;

export type ObservationRecord = Prisma.ObservationGetPayload<{ include: typeof observationInclude }>;

@Injectable()
export class ObservationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserta ignorando huellas ya existentes y devuelve los ids de las filas nuevas.
   * Una sola sentencia por bloque (jsonb_to_recordset) que además calcula `geom`: Prisma no
   * escribe columnas geometry y createMany era ~25 veces más lento con CSV grandes.
   */
  async insertMany(
    batchId: string,
    origin: DataOrigin,
    observations: NormalizedObservation[],
  ): Promise<string[]> {
    const inserted: string[] = [];
    for (let i = 0; i < observations.length; i += INSERT_CHUNK) {
      const rows = JSON.stringify(
        observations.slice(i, i + INSERT_CHUNK).map((o) => ({
          dedupe_key: o.dedupeKey,
          sensor: o.sensor,
          platform: o.platform,
          latitude: o.latitude,
          longitude: o.longitude,
          // timestamp sin zona guarda la hora UTC, igual que Prisma.
          acquired_at: o.acquiredAt.toISOString(),
          confidence_raw: o.confidenceRaw,
          confidence_level: o.confidenceLevel,
          brightness_k: o.brightnessK,
          brightness_aux_k: o.brightnessAuxK,
          frp_mw: o.frpMw,
          scan: o.scan,
          track: o.track,
          day_night: o.dayNight,
          product_version: o.productVersion,
          raw: o.raw,
        })),
      );
      const ids = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO observations (
          id, dedupe_key, sensor, platform, latitude, longitude, geom, acquired_at,
          confidence_raw, confidence_level, brightness_k, brightness_aux_k, frp_mw, scan, track,
          day_night, product_version, origin, raw, batch_id
        )
        SELECT
          gen_random_uuid(), r.dedupe_key, r.sensor::"Sensor", r.platform::"Platform",
          r.latitude, r.longitude, ST_SetSRID(ST_MakePoint(r.longitude, r.latitude), 4326),
          r.acquired_at, r.confidence_raw, r.confidence_level::"ConfidenceLevel", r.brightness_k,
          r.brightness_aux_k, r.frp_mw, r.scan, r.track, r.day_night::"DayNight",
          r.product_version, ${origin}::"DataOrigin", r.raw, ${batchId}::uuid
        FROM jsonb_to_recordset(${rows}::jsonb) AS r(
          dedupe_key text, sensor text, platform text, latitude float8, longitude float8,
          acquired_at timestamp(3), confidence_raw text, confidence_level text,
          brightness_k float8, brightness_aux_k float8, frp_mw float8, scan float8, track float8,
          day_night text, product_version text, raw jsonb
        )
        ON CONFLICT (dedupe_key) DO NOTHING
        RETURNING id`;
      inserted.push(...ids.map((row) => row.id));
    }
    return inserted;
  }

  /**
   * Asigna cada observación al distrito cuyo polígono la cubre (ST_Covers: el borde cuenta
   * como dentro). Si ningún polígono la cubre queda OUTSIDE; si la cubren varios, AMBIGUOUS.
   * Nunca se asigna al distrito más cercano. Sin distritos cargados, todo queda PENDING.
   */
  async assignDistricts(batchId?: string): Promise<AssignmentSummary> {
    const empty = { evaluated: 0, assigned: 0, outside: 0, ambiguous: 0 };
    if ((await this.prisma.district.count()) === 0) return empty;

    const scope = batchId ? Prisma.sql`WHERE o.batch_id = ${batchId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ assignment: string; total: number }[]>`
      WITH matches AS (
        SELECT o.id, count(d.id) AS n, min(d.id) AS district_id
        FROM observations o
        LEFT JOIN districts d ON ST_Covers(d.geom, o.geom)
        ${scope}
        GROUP BY o.id
      ),
      updated AS (
        UPDATE observations o
        SET district_id = CASE WHEN m.n = 1 THEN m.district_id END,
            district_assignment = (CASE
              WHEN m.n = 1 THEN 'ASSIGNED'
              WHEN m.n = 0 THEN 'OUTSIDE'
              ELSE 'AMBIGUOUS' END)::"DistrictAssignment"
        FROM matches m
        WHERE o.id = m.id
        RETURNING o.district_assignment
      )
      SELECT district_assignment::text AS assignment, count(*)::int AS total
      FROM updated GROUP BY district_assignment`;

    const summary = { ...empty };
    for (const { assignment, total } of rows) {
      summary.evaluated += total;
      if (assignment === 'ASSIGNED') summary.assigned = total;
      if (assignment === 'OUTSIDE') summary.outside = total;
      if (assignment === 'AMBIGUOUS') summary.ambiguous = total;
    }
    return summary;
  }

  /** Paginación por cursor ordenada de la más reciente a la más antigua. */
  async findMany(query: ListObservationsQuery): Promise<ObservationRecord[]> {
    return this.prisma.observation.findMany({
      where: buildWhere(query),
      include: observationInclude,
      orderBy: [{ acquiredAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
  }

  findById(id: string) {
    return this.prisma.observation.findUnique({ where: { id }, include: observationInclude });
  }

  findByIds(ids: string[]): Promise<ObservationRecord[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.observation.findMany({
      where: { id: { in: ids } },
      include: observationInclude,
      orderBy: [{ acquiredAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Observaciones en orden cronológico para reproducirlas como si llegaran en vivo. */
  findChronological(filter: ChronologicalFilter, max: number): Promise<ObservationRecord[]> {
    return this.prisma.observation.findMany({
      where: {
        sensor: filter.sensor,
        batchId: filter.batchId,
        ...(filter.from || filter.to ? { acquiredAt: { gte: filter.from, lte: filter.to } } : {}),
        ...(filter.district ? { district: { code: filter.district } } : {}),
      },
      include: observationInclude,
      orderBy: [{ acquiredAt: 'asc' }, { id: 'asc' }],
      take: max,
    });
  }
}

export interface ChronologicalFilter {
  from?: Date;
  to?: Date;
  sensor?: 'MODIS' | 'VIIRS';
  district?: string;
  batchId?: string;
}

const CONFIDENCE_AT_LEAST = {
  LOW: ['LOW', 'NOMINAL', 'HIGH'],
  NOMINAL: ['NOMINAL', 'HIGH'],
  HIGH: ['HIGH'],
} as const;

function buildWhere(q: ListObservationsQuery): Prisma.ObservationWhereInput {
  const where: Prisma.ObservationWhereInput = {
    sensor: q.sensor,
    platform: q.platform,
    origin: q.origin,
    batchId: q.batchId,
    districtAssignment: q.assignment,
  };
  if (q.from || q.to) where.acquiredAt = { gte: q.from, lte: q.to };
  if (q.district) where.district = { code: q.district };
  if (q.minConfidence) where.confidenceLevel = { in: [...CONFIDENCE_AT_LEAST[q.minConfidence]] };
  if (q.bbox) {
    const [minLon, minLat, maxLon, maxLat] = q.bbox;
    where.longitude = { gte: minLon, lte: maxLon };
    where.latitude = { gte: minLat, lte: maxLat };
  }
  return where;
}
