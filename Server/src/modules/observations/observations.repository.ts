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

  /** Inserta ignorando huellas ya existentes. Devuelve los ids de las filas nuevas. */
  async insertMany(
    batchId: string,
    origin: DataOrigin,
    observations: NormalizedObservation[],
  ): Promise<string[]> {
    const inserted: string[] = [];
    for (let i = 0; i < observations.length; i += INSERT_CHUNK) {
      const chunk = observations.slice(i, i + INSERT_CHUNK);
      const rows = await this.prisma.observation.createManyAndReturn({
        data: chunk.map((o) => ({ ...o, batchId, origin })),
        skipDuplicates: true,
        select: { id: true },
      });
      inserted.push(...rows.map((row) => row.id));
    }

    // Prisma no escribe columnas geometry: se derivan de lat/lon en la base.
    await this.prisma.$executeRaw`
      UPDATE observations
      SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
      WHERE batch_id = ${batchId}::uuid AND geom IS NULL`;
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
