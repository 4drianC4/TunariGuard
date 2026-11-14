import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  historialDistritosSchema,
  historialSchema,
  type HistorialDistritosQuery,
  type HistorialQuery,
} from './analisis.schemas.js';
import { HistorialService } from './historial.service.js';

/**
 * Endpoints para la vista /historial del frontend. Cada registro tiene la forma de
 * HistoricalRecord (year, month, source, activityCount, origin) más campos de contexto.
 */
@ApiTags('historial')
@Controller('historial')
export class HistorialController {
  constructor(private readonly historial: HistorialService) {}

  @Get()
  @ApiOperation({
    summary: 'Actividad mensual de un área: armonizada o por sensor (MODIS / VIIRS) sin armonizar',
    description:
      '`fuente=HARMONIZED` devuelve el índice armonizado del paquete. `fuente=MODIS` o `VIIRS` devuelve el conteo ' +
      'bruto de ese sensor (todos sus satélites, sin factores): `activityCount` = celdas-día o detecciones según `medida`. ' +
      '`activityCount = null` significa sin valor comparable (pintar en gris). Incluye `summary` (total, promedio, pico).',
  })
  deArea(@Query({ schema: historialSchema }) q: HistorialQuery) {
    return this.historial.deArea(q);
  }

  @Get('distritos')
  @ApiOperation({
    summary: 'Vistazo general: la actividad mensual de los 15 distritos a la vez',
    description:
      'Mismos parámetros que /historial sin `area_id`. Devuelve cada distrito con sus `records` y `summary`, y un ' +
      '`ranking` por actividad total. Para el total del municipio use /historial?area_id=municipio-cochabamba.',
  })
  deDistritos(@Query({ schema: historialDistritosSchema }) q: HistorialDistritosQuery) {
    return this.historial.deDistritos(q);
  }
}
