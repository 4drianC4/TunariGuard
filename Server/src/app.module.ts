import { Module } from '@nestjs/common';
import { TuniModule } from './modules/tuni/tuni.module.js';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { envSchema } from './infrastructure/config/env.schema.js';
import { DatabaseModule } from './infrastructure/database/database.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AnalisisModule } from './modules/analisis/analisis.module.js';
import { DistrictsModule } from './modules/districts/districts.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IngestionModule } from './modules/ingestion/ingestion.module.js';
import { ObservationsModule } from './modules/observations/observations.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { ReplayModule } from './modules/replay/replay.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    EventEmitterModule.forRoot(),
    DatabaseModule,
    StorageModule,
    HealthModule,
    ObservationsModule,
    DistrictsModule,
    IngestionModule,
    RealtimeModule,
    ReplayModule,
    AnalisisModule,
    TuniModule,
  ],
})
export class AppModule {}
