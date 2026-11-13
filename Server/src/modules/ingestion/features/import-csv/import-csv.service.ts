import { createHash } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BATCH_COMPLETED, type BatchCompletedEvent } from '../../../../shared/domain-events.js';
import { ObservationsService } from '../../../observations/observations.service.js';
import { parseFirmsCsv } from '../../adapters/csv/firms-csv.parser.js';
import { ImportBatchRepository } from '../../adapters/persistence/import-batch.repository.js';
import type { ImportCsvBody } from './import-csv.schemas.js';

/** Errores de fila que se guardan por lote; el total siempre queda en `rejected`. */
const MAX_STORED_ERRORS = 100;

@Injectable()
export class ImportCsvService {
  private readonly logger = new Logger(ImportCsvService.name);

  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly observations: ObservationsService,
    private readonly events: EventEmitter2,
  ) {}

  async import(file: { buffer: Buffer; originalname?: string }, body: ImportCsvBody) {
    let parsed;
    try {
      parsed = parseFirmsCsv(file.buffer, body.sensor);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    const fileName = file.originalname || null;
    const batch = await this.batches.create({
      source: 'CSV',
      fileName,
      checksum: createHash('sha256').update(file.buffer).digest('hex'),
      dataset: body.dataset ?? fileName ?? 'CSV sin nombre',
      origin: body.origin,
      rowsTotal: parsed.rowsTotal,
      rejected: parsed.errors.length,
      errors: parsed.errors.slice(0, MAX_STORED_ERRORS),
    });

    try {
      const result = await this.observations.registerBatch(batch.id, body.origin, parsed.observations);
      await this.batches.complete(batch.id, result);
      this.logger.log(
        `Lote ${batch.id}: ${result.inserted} nuevas, ${result.duplicates} duplicadas, ${parsed.errors.length} rechazadas`,
      );
      this.events.emit(BATCH_COMPLETED, {
        batchId: batch.id,
        dataset: batch.dataset,
        source: batch.source,
        origin: batch.origin,
        rowsTotal: parsed.rowsTotal,
        inserted: result.inserted,
        duplicates: result.duplicates,
        rejected: parsed.errors.length,
        insertedIds: result.insertedIds,
        completedAtUtc: new Date().toISOString(),
      } satisfies BatchCompletedEvent);
      return {
        batchId: batch.id,
        dataset: batch.dataset,
        origin: batch.origin,
        rowsTotal: parsed.rowsTotal,
        inserted: result.inserted,
        duplicates: result.duplicates,
        rejected: parsed.errors.length,
        errors: parsed.errors.slice(0, MAX_STORED_ERRORS),
        districtAssignment: result.assignment,
      };
    } catch (error) {
      // Si falla el registro no queda un lote huérfano con conteos incorrectos.
      await this.batches.delete(batch.id).catch(() => undefined);
      throw error;
    }
  }
}
