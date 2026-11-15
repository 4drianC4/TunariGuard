import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SIMULATED_REMOVED, type SimulatedRemovedEvent } from '../../../../shared/domain-events.js';
import { ObservationsService } from '../../../observations/observations.service.js';
import { removeSimulatedSchema, type RemoveSimulatedBody } from './simulated.schemas.js';

/**
 * Reemplazo de la proyección simulada por datos reales: a medida que llegan detecciones reales,
 * se borran las simuladas de esos días. Sustituye a 3_REEMPLAZO/reemplazar_simulados_por_reales.sql
 * del equipo de datos, pero además avisa a las pantallas (hotspots:removed y alert:removed).
 */
@ApiTags('ingestion')
@Controller('ingestion/simulados')
export class SimulatedController {
  constructor(
    private readonly observations: ObservationsService,
    private readonly events: EventEmitter2,
  ) {}

  @Post('borrar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Borra detecciones SIMULADAS hasta un día (reemplazo por datos reales)',
    description:
      'Primero carga las detecciones reales nuevas; después llama con `hasta` = último día con datos reales completos ' +
      '(hora de Bolivia; el día en curso no cuenta). Sin `aplicar` es un ensayo que solo cuenta. Nunca toca datos ' +
      'reales ni el esquema fuego. Borra también las alertas de esas detecciones y avisa por Socket.IO. Repetirlo borra 0.',
  })
  async borrar(@Body({ schema: removeSimulatedSchema }) body: RemoveSimulatedBody) {
    const hasta = body.hasta ?? null;
    const r = await this.observations.simulatedUpTo(hasta, body.aplicar);
    if (body.aplicar && r.borradosIds.length) {
      this.events.emit(SIMULATED_REMOVED, { observationIds: r.borradosIds, hasta } satisfies SimulatedRemovedEvent);
    }
    return {
      aplicado: body.aplicar,
      hasta,
      simulados: r.simulados,
      [body.aplicar ? 'borrados' : 'aBorrar']: body.aplicar ? r.borradosIds.length : r.aBorrar,
      realesIntactas: r.reales,
    };
  }
}
