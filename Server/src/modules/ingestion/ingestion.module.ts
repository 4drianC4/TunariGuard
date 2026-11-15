import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module.js';
import { FirmsRepository } from './adapters/persistence/firms.repository.js';
import { ImportBatchRepository } from './adapters/persistence/import-batch.repository.js';
import { ImportCsvController } from './features/import-csv/import-csv.controller.js';
import { ImportCsvService } from './features/import-csv/import-csv.service.js';
import { ImportObjectController } from './features/import-object/import-object.controller.js';
import { FirmsSyncController } from './features/sync-firms/firms-sync.controller.js';
import { FirmsSyncService } from './features/sync-firms/firms-sync.service.js';
import { SimulatedController } from './features/simulated/simulated.controller.js';
import { ListBatchesController } from './features/list-batches/list-batches.controller.js';

@Module({
  imports: [ObservationsModule],
  controllers: [ImportCsvController, ImportObjectController, ListBatchesController, SimulatedController, FirmsSyncController],
  providers: [ImportCsvService, ImportBatchRepository, FirmsRepository, FirmsSyncService],
})
export class IngestionModule {}
