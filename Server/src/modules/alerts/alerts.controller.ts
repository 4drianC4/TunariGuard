import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  alertIdSchema,
  backfillAlertsSchema,
  type BackfillAlertsBody,
  listAlertsSchema,
  monthlyContextSchema,
  updateAlertSchema,
  type AlertIdParam,
  type ListAlertsQuery,
  type MonthlyContextQuery,
  type UpdateAlertBody,
} from './alerts.schemas.js';
import { AlertsService } from './alerts.service.js';

/** Endpoints de la vista /alertas. Las alertas nuevas y los cambios de estado llegan además por Socket.IO. */
@ApiTags('alertas')
@Controller('alertas')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alertas operativas con filtros y paginación',
    description:
      'Cada alerta agrupa las detecciones de una pasada satelital dentro de un área vigilada (distrito, sector del ' +
      'Tunari o parque). Incluye `counts` por severidad y estado para las tarjetas de resumen, y `areas` para el ' +
      'selector. Las nuevas llegan por Socket.IO (`alert:new`) y los cambios de estado por `alert:updated`.',
  })
  list(@Query({ schema: listAlertsSchema }) q: ListAlertsQuery) {
    return this.alerts.list(q);
  }

  @Get('contexto-mensual')
  @ApiOperation({
    summary: 'Alerta del mes en curso por área, con un mensaje según nivel_alerta',
    description:
      'Traduce a texto el nivel calculado por el modelo del equipo de datos (normal, elevada, alta, muy_alta, ' +
      'sin_baseline). Cambia como mucho una vez al día, al cargar un corte nuevo (npm run fuego:alerta-mes).',
  })
  monthlyContext(@Query({ schema: monthlyContextSchema }) q: MonthlyContextQuery) {
    return this.alerts.monthlyContext(q);
  }

  @Delete('demo')
  @ApiOperation({ summary: 'Borra las alertas de demostración (generadas en replay o con datos simulados)' })
  deleteDemo() {
    return this.alerts.deleteDemo();
  }

  @Post('regenerar')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Genera las alertas de detecciones ya cargadas (carga histórica, sin esperar un replay)',
    description:
      'Aplica las mismas reglas que la importación sobre las detecciones del periodo. Por defecto es un ensayo ' +
      '(`aplicar: false`): solo cuenta. Con `aplicar: true` crea las alertas (modo live, con una nota). Repetir la ' +
      'llamada no duplica. No emite eventos en tiempo real.',
  })
  backfill(@Body({ schema: backfillAlertsSchema }) body: BackfillAlertsBody) {
    return this.alerts.backfill(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Una alerta (por uuid o código AL-0001)' })
  findOne(@Param({ schema: alertIdSchema }) p: AlertIdParam) {
    return this.alerts.findOne(p.id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cambia el estado de revisión de una alerta',
    description: 'Se guarda y se avisa a todas las pantallas con `alert:updated`.',
  })
  update(@Param({ schema: alertIdSchema }) p: AlertIdParam, @Body({ schema: updateAlertSchema }) body: UpdateAlertBody) {
    return this.alerts.updateStatus(p.id, body);
  }
}
