import { Module } from '@nestjs/common';
import { ObservationsModule } from '../observations/observations.module.js';
import { ImportBatchRepository } from './adapters/persistence/import-batch.repository.js';
import { ImportCsvController } from './features/import-csv/import-csv.controller.js';
import { ImportCsvService } from './features/import-csv/import-csv.service.js';
import { ListBatchesController } from './features/list-batches/list-batches.controller.js';

@Module({
  imports: [ObservationsModule],
  controllers: [ImportCsvController, ListBatchesController],
  providers: [ImportCsvService, ImportBatchRepository],
})
export class IngestionModule {}
