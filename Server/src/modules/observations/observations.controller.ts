import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ObservationsService } from './observations.service.js';
import { listObservationsQuerySchema, type ListObservationsQuery } from './observations.schemas.js';

@ApiTags('observations')
@Controller('observations')
export class ObservationsController {
  constructor(private readonly observations: ObservationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Detecciones térmicas con filtros y paginación por cursor',
    description:
      'Ordenadas de la más reciente a la más antigua. format=geojson devuelve un FeatureCollection ' +
      'listo para el mapa. Una detección térmica no confirma un incendio.',
  })
  list(@Query({ schema: listObservationsQuerySchema }) query: ListObservationsQuery) {
    return this.observations.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una observación con su fila original' })
  findOne(@Param('id', { schema: z.uuid() }) id: string) {
    return this.observations.findOne(id);
  }
}
