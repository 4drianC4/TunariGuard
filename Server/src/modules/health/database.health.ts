import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { describeDbError } from '../../infrastructure/database/describe-db-error.js';
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
      const message = describeDbError(error, this.prisma.connectionString);
      this.logger.warn(message);
      return indicator.down(message);
    }
  }
}
