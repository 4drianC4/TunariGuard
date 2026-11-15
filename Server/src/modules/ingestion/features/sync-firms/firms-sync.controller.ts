import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirmsSyncService } from './firms-sync.service.js';

@ApiTags('ingestion')
@Controller('ingestion/firms')
export class FirmsSyncController {
  constructor(private readonly firms: FirmsSyncService) {}

  @Get('estado')
  @ApiOperation({
    summary: 'Estado de la sincronización periódica con NASA FIRMS',
    description: 'Si está activa, cada cuánto corre, cuándo es la próxima y el resultado de la última por satélite.',
  })
  status() {
    return this.firms.status();
  }

  @Post('sincronizar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sincroniza ahora con NASA FIRMS (últimas 24 h del parque y el municipio)',
    description:
      'Descarga los datos NRT de cada satélite, filtra la zona, importa solo lo nuevo y genera sus alertas. ' +
      'Funciona aunque la sincronización automática esté desactivada. Si ya hay una en curso, espera esa.',
  })
  sync() {
    return this.firms.sync('manual');
  }
}
