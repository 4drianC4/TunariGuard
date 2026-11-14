import {
  Body,
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SchemaPipe } from '../../../../infrastructure/http/schema.pipe.js';
import { ImportCsvService } from './import-csv.service.js';
import { importCsvBodySchema, type ImportCsvBody } from './import-csv.schemas.js';

@ApiTags('ingestion')
@Controller('ingestion')
export class ImportCsvController {
  constructor(private readonly importCsv: ImportCsvService) {}

  @Post('csv')
  @ApiOperation({
    summary: 'Importa un CSV de NASA FIRMS (MODIS o VIIRS)',
    description:
      'Idempotente: reimportar el mismo archivo no duplica observaciones. Las filas inválidas se ' +
      'reportan con su número de línea sin detener el lote. Asigna distritos al terminar. ' +
      'Para archivos de más de unos pocos MB usa el flujo de MinIO (POST /ingestion/uploads).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        dataset: { type: 'string', example: 'FIRMS VIIRS_SNPP_NRT' },
        origin: { type: 'string', enum: ['REAL', 'SIMULATED'], default: 'REAL' },
        sensor: { type: 'string', enum: ['MODIS', 'VIIRS'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  import(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
    @Body(new SchemaPipe(importCsvBodySchema)) body: ImportCsvBody,
  ) {
    return this.importCsv.import({ stream: file.buffer, fileName: file.originalname || null }, body);
  }
}
