import { readFile } from 'node:fs/promises';
import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { t } from '../../shared/i18n/language.js';

const ARCHIVO = new URL('../../../data/demo/serie_proyeccion_mensual.csv', import.meta.url);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato YYYY-MM');
const querySchema = z
  .object({ desde: mes.optional(), hasta: mes.optional() })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { error: () => t('desde debe ser anterior o igual a hasta'), path: ['desde'] });

const fila = z.object({
  mes,
  dias_simulados: z.coerce.number(),
  indice_esperado_modelo: z.coerce.number(),
  k_detecciones_por_celda_dia: z.coerce.number(),
  esperado_detecciones: z.coerce.number(),
  detecciones_generadas: z.coerce.number(),
});

/**
 * Serie mensual de la proyección SIMULADA del equipo de datos (data/demo): lo que el modelo espera
 * cada mes y cuántas detecciones se inventaron. Es un futuro posible, no un pronóstico.
 */
@ApiTags('series')
@Controller('proyeccion')
export class ProyeccionController {
  @Get('mensual')
  @ApiOperation({
    summary: 'Proyección simulada mensual (nov-2026 a dic-2031): esperado por el modelo y detecciones generadas',
    description:
      'Datos INVENTADOS para la demo: un futuro posible según el modelo del equipo de datos, no una predicción. ' +
      'Las detecciones de esta proyección se cargan con npm run datos:demo y llegan a su hora como datos simulados.',
  })
  async mensual(@Query({ schema: querySchema }) q: z.infer<typeof querySchema>) {
    let texto: string;
    try {
      texto = await readFile(ARCHIVO, 'utf8');
    } catch {
      throw new NotFoundException(t('No está el archivo data/demo/serie_proyeccion_mensual.csv'));
    }
    const items = z
      .array(fila)
      .parse(parse(texto, { columns: true, bom: true, skip_empty_lines: true, trim: true }))
      .filter((r) => (!q.desde || r.mes >= q.desde) && (!q.hasta || r.mes <= q.hasta));
    return {
      simulated: true,
      aviso: t(
        'Proyección SIMULADA: un futuro posible según un modelo, no una predicción. indice_esperado_modelo está en ' +
        'celdas-día MODIS-equivalentes; una detección satelital no confirma un incendio.'),
      items,
    };
  }
}
