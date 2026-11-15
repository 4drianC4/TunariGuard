import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { DEFAULT_BBOX, type Bbox } from '../firms/firms-sources.js';

@Injectable()
export class FirmsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Rectángulo del parque y el municipio (+0,02°) desde fuego.areas; el de respaldo si no está cargado. */
  async zoneBbox(): Promise<Bbox> {
    try {
      const [row] = await this.prisma.$queryRaw<{ w: number; s: number; e: number; n: number }[]>`
        SELECT ST_XMin(x) - 0.02 AS w, ST_YMin(x) - 0.02 AS s, ST_XMax(x) + 0.02 AS e, ST_YMax(x) + 0.02 AS n
        FROM (SELECT ST_Extent(geom) AS x FROM fuego.areas WHERE area_id IN ('parque-tunari', 'municipio-cochabamba')) t`;
      if (row && [row.w, row.s, row.e, row.n].every(Number.isFinite)) return [row.w, row.s, row.e, row.n];
    } catch {
      // Sin esquema fuego: rectángulo por defecto.
    }
    return DEFAULT_BBOX;
  }

  /** Huellas que ya están en la base, para no crear lotes vacíos en cada sincronización. */
  async existingKeys(keys: string[]): Promise<Set<string>> {
    if (!keys.length) return new Set();
    const rows = await this.prisma.$queryRaw<{ dedupe_key: string }[]>`
      SELECT dedupe_key FROM observations WHERE dedupe_key = ANY (${keys}::text[])`;
    return new Set(rows.map((r) => r.dedupe_key));
  }
}
