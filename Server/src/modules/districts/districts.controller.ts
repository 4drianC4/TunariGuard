import {
  Body,
  Controller,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { SchemaPipe } from '../../infrastructure/http/schema.pipe.js';
import { queryBoolean } from '../../shared/query-schemas.js';
import { DistrictsService } from './districts.service.js';
import {
  importDistrictsBodySchema,
  listDistrictsQuerySchema,
  type ImportDistrictsBody,
  type ListDistrictsQuery,
} from './districts.schemas.js';

const importFuegoQuerySchema = z.object({
  replace: queryBoolean.default(true).describe('Borra los distritos que no vienen de fuego.areas (evita solapes)'),
});

@ApiTags('districts')
@Controller('districts')
export class DistrictsController {
  constructor(private readonly districts: DistrictsService) {}

  @Get()
  @ApiOperation({ summary: 'Distritos con conteo de observaciones; GeoJSON opcional' })
  list(@Query({ schema: listDistrictsQuerySchema }) query: ListDistrictsQuery) {
    return query.format === 'geojson' ? this.districts.listGeoJson() : this.districts.list();
  }

  @Post('import')
  @ApiOperation({
    summary: 'Importa límites distritales (FeatureCollection GeoJSON en WGS84)',
    description:
      'Reemplaza los distritos con el mismo código y recalcula la asignación de todas las observaciones.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'source', 'version'],
      properties: {
        file: { type: 'string', format: 'binary' },
        source: { type: 'string', example: 'GAM Cochabamba — Dirección de Catastro' },
        version: { type: 'string', example: '2024-01' },
        provisional: { type: 'boolean', default: false },
        codeProperty: { type: 'string', default: 'code' },
        nameProperty: { type: 'string', default: 'name' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  import(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
    @Body(new SchemaPipe(importDistrictsBodySchema)) body: ImportDistrictsBody,
  ) {
    return this.districts.import(file.buffer, body);
  }

  @Post('import-fuego')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Usa los 15 distritos del paquete de datos (fuego.areas) como límites',
    description:
      'Códigos distrito-01 … distrito-15, los mismos del análisis, así ambos mundos se cruzan por distrito. ' +
      'Reasigna todas las observaciones. Se hace solo al arrancar si no hay distritos.',
  })
  importFuego(@Query({ schema: importFuegoQuerySchema }) query: z.infer<typeof importFuegoQuerySchema>) {
    return this.districts.importFromFuego(query.replace);
  }
}
