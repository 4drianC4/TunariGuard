import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database.health.js';
import { HealthController } from './health.controller.js';
import { StorageHealthIndicator } from './storage.health.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, StorageHealthIndicator],
})
export class HealthModule {}
