import { msg } from '../../../../shared/i18n/language.js';
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ImportBatchRepository } from '../../adapters/persistence/import-batch.repository.js';

const listBatchesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Procedencia: qué se importó, cuándo, de dónde y con qué resultado. */
@ApiTags('ingestion')
@Controller('ingestion/batches')
export class ListBatchesController {
  constructor(private readonly batches: ImportBatchRepository) {}

  @Get()
  @ApiOperation({ summary: 'Lotes importados, del más reciente al más antiguo' })
  list(@Query({ schema: listBatchesQuerySchema }) query: z.infer<typeof listBatchesQuerySchema>) {
    return this.batches.list(query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Un lote con sus errores de fila' })
  async findOne(@Param('id', { schema: z.uuid() }) id: string) {
    const batch = await this.batches.findById(id);
    if (!batch) throw new NotFoundException(msg`Lote ${id} no encontrado`);
    return batch;
  }
}
