import { t } from '../../shared/i18n/language.js';
import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { StorageService } from '../../infrastructure/storage/storage.service.js';

@Injectable()
export class StorageHealthIndicator {
  private readonly logger = new Logger(StorageHealthIndicator.name);

  constructor(
    private readonly indicators: HealthIndicatorService,
    private readonly storage: StorageService,
  ) {}

  /** Verifica que MinIO/S3 responda y que el bucket de subidas exista (lo crea si falta). */
  async check(key: string) {
    const indicator = this.indicators.check(key);
    try {
      await this.storage.ensureBucket(true);
      return indicator.up({ bucket: this.storage.bucket });
    } catch (error) {
      this.logger.warn(`Almacenamiento no disponible: ${String(error)}`);
      return indicator.down(t('Sin conexión con MinIO (¿ejecutaste npm run db:up?)'));
    }
  }
}
