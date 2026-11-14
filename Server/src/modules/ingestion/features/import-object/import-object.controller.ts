import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { StorageService } from '../../../../infrastructure/storage/storage.service.js';
import { ImportCsvService } from '../import-csv/import-csv.service.js';
import {
  createUploadSchema,
  importObjectSchema,
  listUploadsSchema,
  type CreateUploadBody,
  type ImportObjectBody,
  type ListUploadsQuery,
} from './import-object.schemas.js';
import { buildCsvObjectKey } from './object-key.js';

const CSV_CONTENT_TYPE = 'text/csv';

/**
 * CSV pesados vía MinIO/S3, en dos pasos:
 * 1. `POST /ingestion/uploads` → URL firmada; el cliente sube el archivo directo a MinIO (PUT).
 *    También se puede arrastrar a la consola de MinIO.
 * 2. `POST /ingestion/uploads/import` con la clave → el backend lo lee por streaming e importa.
 */
@ApiTags('ingestion')
@Controller('ingestion/uploads')
export class ImportObjectController {
  constructor(
    private readonly storage: StorageService,
    private readonly importCsv: ImportCsvService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Pide una URL firmada para subir un CSV directo a MinIO',
    description:
      'Responde `uploadUrl`, `method` y `headers`. Sube el archivo con ese método y esas cabeceras ' +
      '(p. ej. `curl -X PUT -H "Content-Type: text/csv" -T archivo.csv "<uploadUrl>"`) y luego ' +
      'llama a POST /ingestion/uploads/import con `objectKey`. El archivo no pasa por el backend.',
  })
  createUpload(@Body({ schema: createUploadSchema }) body: CreateUploadBody) {
    const objectKey = buildCsvObjectKey(body.fileName);
    return this.storage.presignUpload(objectKey, CSV_CONTENT_TYPE, body.expiresInSeconds);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los archivos del bucket, los más recientes primero' })
  async list(@Query({ schema: listUploadsSchema }) query: ListUploadsQuery) {
    return { bucket: this.storage.bucket, items: await this.storage.list(query.prefix, query.limit) };
  }

  @Post('import')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Importa a la base un CSV FIRMS que ya está en MinIO',
    description:
      'Lee el objeto por streaming e inserta por bloques, así que admite archivos de cientos de MB. ' +
      'Es idempotente como POST /ingestion/csv. Responde al terminar; con archivos muy grandes ' +
      'puede tardar minutos. Si inserta más de 5000 focos no los empuja por socket: emite ' +
      '`sync:status` con `announced: false` para que el frontend recargue.',
  })
  async importObject(@Body({ schema: importObjectSchema }) body: ImportObjectBody) {
    const { objectKey, ...options } = body;
    // Si la clave no existe responde 404 antes de crear el lote.
    const stream = await this.storage.openReadStream(objectKey);
    return this.importCsv.import({ stream, fileName: objectKey }, options);
  }
}
