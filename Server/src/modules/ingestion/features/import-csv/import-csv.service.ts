import type { Readable } from 'node:stream';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BATCH_COMPLETED, type BatchCompletedEvent } from '../../../../shared/domain-events.js';
import { ObservationsService } from '../../../observations/observations.service.js';
import { CsvFormatError, readFirmsCsv } from '../../adapters/csv/firms-csv.parser.js';
import { ImportBatchRepository } from '../../adapters/persistence/import-batch.repository.js';
import type { ImportCsvBody } from './import-csv.schemas.js';

/** Errores de fila que se guardan por lote; el total siempre queda en `rejected`. */
const MAX_STORED_ERRORS = 100;
/** Filas por inserción; acota la memoria con CSV de cientos de MB. */
const CHUNK_SIZE = 2000;
/**
 * Más focos nuevos que esto no se empujan por socket (sería inundar al navegador con un
 * histórico): se avisa con `sync:status` y el frontend recarga por REST.
 */
const LIVE_ANNOUNCE_LIMIT = 5000;

export interface CsvSource {
  stream: Readable | Buffer;
  /** Nombre original o clave del objeto en S3; queda como trazabilidad del lote. */
  fileName: string | null;
}

/**
 * Importa un CSV FIRMS venga de donde venga (multipart o MinIO). Lee por streaming e inserta
 * por bloques; si algo falla a mitad, borra el lote y con él lo insertado (cascade).
 */
@Injectable()
export class ImportCsvService {
  private readonly logger = new Logger(ImportCsvService.name);

  constructor(
    private readonly batches: ImportBatchRepository,
    private readonly observations: ObservationsService,
    private readonly events: EventEmitter2,
  ) {}

  async import({ stream, fileName }: CsvSource, body: ImportCsvBody) {
    const startedAt = Date.now();
    const batch = await this.batches.create({
      source: 'CSV',
      fileName,
      dataset: body.dataset ?? fileName ?? 'CSV sin nombre',
      origin: body.origin,
    });

    try {
      const insertedIds: string[] = [];
      let inserted = 0;

      const summary = await readFirmsCsv(stream, {
        hint: body.sensor,
        chunkSize: CHUNK_SIZE,
        maxErrors: MAX_STORED_ERRORS,
        onChunk: async (chunk) => {
          const ids = await this.observations.insertChunk(batch.id, body.origin, chunk);
          inserted += ids.length;
          if (insertedIds.length <= LIVE_ANNOUNCE_LIMIT) insertedIds.push(...ids);
        },
      });

      const duplicates = summary.accepted - inserted;
      const assignment = await this.observations.assignBatchDistricts(batch.id);
      await this.batches.complete(batch.id, {
        checksum: summary.checksum,
        rowsTotal: summary.rowsTotal,
        inserted,
        duplicates,
        rejected: summary.rejected,
        errors: summary.errors,
      });

      const announced = inserted <= LIVE_ANNOUNCE_LIMIT;
      this.logger.log(
        `Lote ${batch.id} (${formatBytes(summary.bytes)}, ${Date.now() - startedAt} ms): ` +
          `${inserted} nuevas, ${duplicates} duplicadas, ${summary.rejected} rechazadas`,
      );
      this.events.emit(BATCH_COMPLETED, {
        batchId: batch.id,
        dataset: batch.dataset,
        source: batch.source,
        origin: batch.origin,
        rowsTotal: summary.rowsTotal,
        inserted,
        duplicates,
        rejected: summary.rejected,
        insertedIds: announced ? insertedIds : [],
        announced,
        completedAtUtc: new Date().toISOString(),
      } satisfies BatchCompletedEvent);

      return {
        batchId: batch.id,
        dataset: batch.dataset,
        origin: batch.origin,
        fileName,
        bytes: summary.bytes,
        rowsTotal: summary.rowsTotal,
        inserted,
        duplicates,
        rejected: summary.rejected,
        errors: summary.errors,
        districtAssignment: assignment,
        announcedLive: announced,
      };
    } catch (error) {
      // Si falla el registro no queda un lote huérfano con conteos incorrectos.
      await this.batches.delete(batch.id).catch(() => undefined);
      if (error instanceof CsvFormatError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
