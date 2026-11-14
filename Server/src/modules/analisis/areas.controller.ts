import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  alertaMesSchema,
  alertasSchema,
  areaIdParamSchema,
  calendarioSchema,
  listarAreasSchema,
  puntosCalientesSchema,
  rangoSchema,
  recurrenciaSchema,
  serieSchema,
  type AlertaMesQuery,
  type AlertasQuery,
  type AreaIdParam,
  type CalendarioQuery,
  type ListarAreasQuery,
  type PuntosCalientesQuery,
  type RangoQuery,
  type RecurrenciaQuery,
  type SerieQuery,
} from './analisis.schemas.js';
import { AnalisisService } from './analisis.service.js';

/**
 * Áreas, series y alertas del esquema fuego (contrato: data/fuego/docs/openapi.yaml).
 * Las cifras deben mostrarse con las advertencias de GET /metadatos.
 */
@Controller('areas')
export class AreasController {
  constructor(private readonly analisis: AnalisisService) {}

  @Get()
  @ApiTags('areas')
  @ApiOperation({
    summary: 'Áreas analizables (parque, municipio, 15 distritos, sectores del Tunari, zonas GAMC)',
    description: 'Para mostrar un área usa `nombre_visible`, no `nombre`. Ninguna geometría es oficial.',
  })
  listar(@Query({ schema: listarAreasSchema }) q: ListarAreasQuery) {
    return this.analisis.listarAreas(q.tipo, q.formato);
  }

  @Get(':area_id')
  @ApiTags('areas')
  @ApiOperation({ summary: 'Detalle de un área con su geometría GeoJSON' })
  detalle(@Param({ schema: areaIdParamSchema }) p: AreaIdParam) {
    return this.analisis.area(p.area_id);
  }

  @Get(':area_id/calendario')
  @ApiTags('series')
  @ApiOperation({
    summary: 'Calendario térmico mes × año (heatmap)',
    description: 'Índice en celdas-día MODIS-equivalentes (relativo). `indice` nulo = no comparable: pintar en gris, nunca como cero.',
  })
  calendario(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: calendarioSchema }) q: CalendarioQuery) {
    return this.analisis.calendario(p.area_id, q);
  }

  @Get(':area_id/serie')
  @ApiTags('series')
  @ApiOperation({
    summary: 'Serie armonizada con bandas de incertidumbre',
    description: '`mensual` es solo indicativa (error ~40 %). `trimestral` y `anual` solo existen para parque-tunari.',
  })
  serie(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: serieSchema }) q: SerieQuery) {
    return this.analisis.serie(p.area_id, q);
  }

  @Get(':area_id/serie-armonizada')
  @ApiTags('series')
  @ApiOperation({
    summary: 'Serie mensual armonizada según el catálogo de satélites',
    description: 'Usa fuego.serie_armonizada_area. Mostrar siempre `aviso` y `fuentes_usadas`.',
  })
  serieArmonizada(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: rangoSchema }) q: RangoQuery) {
    return this.analisis.serieArmonizada(p.area_id, q.desde, q.hasta);
  }

  @Get(':area_id/alertas')
  @ApiTags('alertas')
  @ApiOperation({
    summary: 'Alertas estadísticas mensuales',
    description:
      'Señal estadística que requiere verificación; no confirma un incendio. No presentar `equivalente_anios_indicativo` como "una vez cada N años".',
  })
  alertas(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: alertasSchema }) q: AlertasQuery) {
    return this.analisis.alertas(p.area_id, q);
  }

  @Get(':area_id/alerta-mes-en-curso')
  @ApiTags('alertas')
  @ApiOperation({
    summary: 'Alerta del mes en curso',
    description:
      'Compara lo acumulado en los primeros días del mes con el mismo tramo de años anteriores; no pronostica el resto del mes. ' +
      'Mostrar `lectura`, `dias_transcurridos`, `satelite_base` y `anios_de_historial`.',
  })
  alertaMesEnCurso(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: alertaMesSchema }) q: AlertaMesQuery) {
    return this.analisis.alertaMesEnCurso(p.area_id, q.historial);
  }

  @Get(':area_id/estado-actual')
  @ApiTags('alertas')
  @ApiOperation({ summary: '(Deprecado) Alias de /areas/{area_id}/alerta-mes-en-curso', deprecated: true })
  estadoActual(@Param({ schema: areaIdParamSchema }) p: AreaIdParam) {
    return this.analisis.alertaMesEnCurso(p.area_id, false);
  }

  @Get(':area_id/recurrencia')
  @ApiTags('espacial')
  @ApiOperation({ summary: 'Recurrencia por celda de 1 km (en cuántos años hubo fuego)' })
  recurrencia(@Param({ schema: areaIdParamSchema }) p: AreaIdParam, @Query({ schema: recurrenciaSchema }) q: RecurrenciaQuery) {
    return this.analisis.recurrencia(p.area_id, q);
  }

  @Get(':area_id/puntos-calientes')
  @ApiTags('espacial')
  @ApiOperation({ summary: 'Celdas con concentración significativa (Getis-Ord Gi*) y sus conglomerados' })
  puntosCalientes(
    @Param({ schema: areaIdParamSchema }) p: AreaIdParam,
    @Query({ schema: puntosCalientesSchema }) q: PuntosCalientesQuery,
  ) {
    return this.analisis.puntosCalientes(p.area_id, q);
  }

  @Get(':area_id/tendencias')
  @ApiTags('series')
  @ApiOperation({ summary: 'Pruebas de tendencia (Mann-Kendall y Sen)' })
  tendencias(@Param({ schema: areaIdParamSchema }) p: AreaIdParam) {
    return this.analisis.tendencias(p.area_id);
  }
}
