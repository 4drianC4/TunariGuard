import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';
import { describeDbError } from './describe-db-error.js';

/**
 * Cliente Prisma compartido. La conexión es perezosa: se abre en la primera consulta,
 * así la API arranca aunque la base no esté disponible y /health informa el problema.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly connectionString: string;

  constructor(config: ConfigService<Env, true>) {
    const connectionString = config.get('DATABASE_URL', { infer: true });
    super({ adapter: new PrismaPg({ connectionString }) });
    this.connectionString = connectionString;
  }

  /** Prueba la conexión al arrancar solo para avisar con un mensaje claro; no detiene la API. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(describeDbError(error, this.connectionString));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
