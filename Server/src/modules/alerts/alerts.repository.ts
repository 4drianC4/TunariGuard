import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { AlertStatusValue, AlertRecord } from './domain/alert-dto.js';
import type { AlertCandidate, DetectionForAlert, Severity } from './domain/alert-rules.js';
import type { MonthlyAlertRow } from './domain/monthly-context.js';

export interface AlertFilter {
  fromUtc?: Date;
  toUtc?: Date;
  areaId?: string;
  severity?: Severity;
  status?: AlertStatusValue;
  mode?: 'LIVE' | 'REPLAY';
  origin?: 'REAL' | 'SIMULATED';
}

interface DetectionRow {
  id: string;
  sensor: 'MODIS' | 'VIIRS';
  platform: string;
  acquired_at: Date;
  latitude: number;
  longitude: number;
  confidence_level: 'LOW' | 'NOMINAL' | 'HIGH' | null;
  confidence_raw: string | null;
  frp_mw: number | null;
  origin: 'REAL' | 'SIMULATED';
  batch_id: string | null;
  area_id: string;
  area_name: string;
  area_type: string;
  in_park: boolean;
}

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async fuegoAvailable(): Promise<boolean> {
    const [row] = await this.prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('fuego.areas') IS NOT NULL AS ok`;
    return row?.ok ?? false;
  }

  /**
   * Detecciones de vegetación (tipo 0 o desconocido) que caen en un área vigilada, con su área.
   * Con el paquete fuego: distrito de Cochabamba si cae en uno; si no, el sector del Tunari por
   * municipio (solo dentro del parque) o el parque. Sin el paquete: los distritos de la app.
   */
  async detections(scope: { batchId: string } | { observationIds: string[] }, useFuego: boolean): Promise<DetectionForAlert[]> {
    const filter =
      'batchId' in scope
        ? Prisma.sql`o.batch_id = ${scope.batchId}::uuid`
        : Prisma.sql`o.id = ANY (${scope.observationIds}::uuid[])`;

    const rows = useFuego
      ? await this.prisma.$queryRaw<DetectionRow[]>`
          WITH parque AS (SELECT geom FROM fuego.areas WHERE area_id = 'parque-tunari')
          SELECT o.id, o.sensor::text AS sensor, o.platform::text AS platform, o.acquired_at, o.latitude, o.longitude,
                 o.confidence_level::text AS confidence_level, o.confidence_raw, o.frp_mw, o.origin::text AS origin,
                 o.batch_id, a.area_id, a.nombre_visible AS area_name, a.tipo AS area_type,
                 COALESCE(ST_Covers(p.geom, o.geom), false) AS in_park
          FROM observations o
          LEFT JOIN parque p ON true
          JOIN LATERAL (
            SELECT x.area_id, x.nombre_visible, x.tipo FROM fuego.areas x
            WHERE ST_Covers(x.geom, o.geom)
              AND (x.tipo = 'distrito' OR (x.tipo IN ('municipio_parque', 'parque') AND ST_Covers(p.geom, o.geom)))
            ORDER BY CASE x.tipo WHEN 'distrito' THEN 0 WHEN 'municipio_parque' THEN 1 ELSE 2 END
            LIMIT 1
          ) a ON true
          WHERE ${filter} AND o.geom IS NOT NULL AND (o.detection_type IS NULL OR o.detection_type = 0)`
      : await this.prisma.$queryRaw<DetectionRow[]>`
          SELECT o.id, o.sensor::text AS sensor, o.platform::text AS platform, o.acquired_at, o.latitude, o.longitude,
                 o.confidence_level::text AS confidence_level, o.confidence_raw, o.frp_mw, o.origin::text AS origin,
                 o.batch_id, d.code AS area_id, d.name AS area_name, 'distrito' AS area_type, false AS in_park
          FROM observations o JOIN districts d ON d.id = o.district_id
          WHERE ${filter} AND o.district_assignment = 'ASSIGNED'
            AND (o.detection_type IS NULL OR o.detection_type = 0)`;

    return rows.map((r) => ({
      id: r.id,
      areaId: r.area_id,
      areaName: r.area_name,
      areaType: r.area_type,
      inPark: r.in_park,
      sensor: r.sensor,
      platform: r.platform,
      acquiredAt: r.acquired_at,
      latitude: r.latitude,
      longitude: r.longitude,
      confidenceLevel: r.confidence_level,
      confidenceRaw: r.confidence_raw,
      frpMw: r.frp_mw,
      origin: r.origin,
      batchId: r.batch_id,
    }));
  }

  /** Guarda las alertas nuevas; las repetidas (misma huella) se omiten. Devuelve solo las nuevas. */
  async insertMany(candidates: AlertCandidate[]): Promise<AlertRecord[]> {
    if (!candidates.length) return [];
    const inserted: AlertRecord[] = [];
    for (let i = 0; i < candidates.length; i += 500) {
      const rows = await this.prisma.alert.createManyAndReturn({
        data: candidates.slice(i, i + 500).map((c) => ({
          ...c,
          platform: c.platform as Prisma.AlertCreateManyInput['platform'],
        })),
        skipDuplicates: true,
      });
      inserted.push(...(rows as AlertRecord[]));
    }
    return inserted.sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
  }

  async list(filter: AlertFilter, page: number, limit: number) {
    const where = whereOf(filter);
    const [rows, total, bySeverity, byStatus, areas] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        orderBy: [{ detectedAt: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.alert.count({ where }),
      this.prisma.alert.groupBy({ by: ['severity'], where, _count: { _all: true } }),
      this.prisma.alert.groupBy({ by: ['status'], where, _count: { _all: true } }),
      // Áreas con alertas en el periodo (sin filtrar por área), para el selector de la vista.
      this.prisma.alert.groupBy({
        by: ['areaId', 'areaName'],
        where: whereOf({ ...filter, areaId: undefined }),
        _count: { _all: true },
        orderBy: { areaName: 'asc' },
      }),
    ]);
    return {
      rows: rows as AlertRecord[],
      total,
      bySeverity: Object.fromEntries(bySeverity.map((g) => [g.severity, g._count._all])) as Partial<Record<Severity, number>>,
      byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])) as Partial<Record<AlertStatusValue, number>>,
      areas: areas.map((g) => ({ areaId: g.areaId, areaName: g.areaName, count: g._count._all })),
    };
  }

  async find(id: string): Promise<AlertRecord | null> {
    const code = /^AL-(\d+)$/i.exec(id);
    const row = code
      ? await this.prisma.alert.findUnique({ where: { number: Number(code[1]) } })
      : await this.prisma.alert.findUnique({ where: { id } });
    return row as AlertRecord | null;
  }

  async updateStatus(id: string, status: AlertStatusValue, note: string | undefined): Promise<AlertRecord> {
    const row = await this.prisma.alert.update({
      where: { id },
      data: { status, statusChangedAt: new Date(), ...(note !== undefined ? { note } : {}) },
    });
    return row as AlertRecord;
  }

  /** Borra las alertas de demostración: generadas en un replay o de datos simulados. */
  async deleteDemo(): Promise<number> {
    const { count } = await this.prisma.alert.deleteMany({ where: { OR: [{ mode: 'REPLAY' }, { origin: 'SIMULATED' }] } });
    return count;
  }

  monthly(areaId: string | undefined): Promise<MonthlyAlertRow[]> {
    return this.prisma.$queryRaw<MonthlyAlertRow[]>`
      SELECT v.area_id, a.nombre_visible, to_char(v.fecha_corte, 'YYYY-MM-DD') AS fecha_corte,
             to_char(v.mes, 'YYYY-MM-DD') AS mes, v.dias_transcurridos, v.celdas_dia_observadas,
             v.esperado_modelo, v.probabilidad_exceso, v.satelite_base, v.nivel_alerta, v.lectura
      FROM fuego.v_alerta_mes_en_curso v JOIN fuego.areas a USING (area_id)
      WHERE ${areaId ?? null}::text IS NULL OR v.area_id = ${areaId ?? null}
      ORDER BY CASE v.nivel_alerta WHEN 'muy_alta' THEN 0 WHEN 'alta' THEN 1 WHEN 'elevada' THEN 2 ELSE 3 END, v.area_id`;
  }
}

function whereOf(f: AlertFilter): Prisma.AlertWhereInput {
  return {
    ...(f.fromUtc || f.toUtc ? { detectedAt: { gte: f.fromUtc, lt: f.toUtc } } : {}),
    areaId: f.areaId,
    severity: f.severity,
    status: f.status,
    mode: f.mode,
    origin: f.origin,
  };
}
