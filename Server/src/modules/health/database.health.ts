import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

@Injectable()
export class DatabaseHealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
  ) {}

  /** Verifica la conexión y que la extensión PostGIS esté instalada. */
  async check(key: string) {
    const indicator = this.indicators.check(key);
    try {
      const rows = await this.prisma.$queryRaw<{ postgis: string | null }[]>`
        SELECT extversion AS postgis FROM pg_extension WHERE extname = 'postgis'`;
      const postgis = rows[0]?.postgis ?? null;
      return postgis
        ? indicator.up({ postgis })
        : indicator.down('PostGIS no está instalado; ejecuta las migraciones');
    } catch (error) {
      this.logger.warn(`Base de datos no disponible: ${String(error)}`);
      return indicator.down('Sin conexión con la base de datos (¿ejecutaste npm run db:up?)');
    }
  }
}
