import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { DistrictInput } from './domain/district-feature.js';

export interface DistrictMetadata {
  source: string;
  version: string;
  provisional: boolean;
}

export interface DistrictRow {
  id: number;
  code: string;
  name: string;
  source: string;
  version: string;
  provisional: boolean;
  importedAt: Date;
  observationCount: number;
  areaKm2: number;
}

@Injectable()
export class DistrictsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Inserta o reemplaza los distritos por código. ST_MakeValid corrige anillos inválidos
   * y ST_CollectionExtract conserva solo la parte poligonal.
   */
  async upsertMany(districts: DistrictInput[], meta: DistrictMetadata): Promise<number> {
    await this.prisma.$transaction(
      districts.map(
        (d) => this.prisma.$executeRaw`
          INSERT INTO districts (code, name, source, version, provisional, geom)
          VALUES (
            ${d.code}, ${d.name}, ${meta.source}, ${meta.version}, ${meta.provisional},
            ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${d.geometry}), 4326)), 3))
          )
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            source = EXCLUDED.source,
            version = EXCLUDED.version,
            provisional = EXCLUDED.provisional,
            geom = EXCLUDED.geom,
            imported_at = now()`,
      ),
    );
    return districts.length;
  }

  async list(): Promise<DistrictRow[]> {
    return this.prisma.$queryRaw<DistrictRow[]>`
      SELECT d.id, d.code, d.name, d.source, d.version, d.provisional,
             d.imported_at AS "importedAt",
             (SELECT count(*)::int FROM observations o WHERE o.district_id = d.id) AS "observationCount",
             round((ST_Area(d.geom::geography) / 1e6)::numeric, 2)::float AS "areaKm2"
      FROM districts d
      ORDER BY d.code`;
  }

  async listGeoJson(): Promise<(DistrictRow & { geometry: string })[]> {
    return this.prisma.$queryRaw`
      SELECT d.id, d.code, d.name, d.source, d.version, d.provisional,
             d.imported_at AS "importedAt",
             (SELECT count(*)::int FROM observations o WHERE o.district_id = d.id) AS "observationCount",
             round((ST_Area(d.geom::geography) / 1e6)::numeric, 2)::float AS "areaKm2",
             ST_AsGeoJSON(d.geom, 6) AS geometry
      FROM districts d
      ORDER BY d.code`;
  }
}
