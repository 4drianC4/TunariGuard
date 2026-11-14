import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  buscarDeteccionesSchema,
  deteccionesSchema,
  eventosSchema,
  poligonoBodySchema,
  type BuscarDeteccionesBody,
  type DeteccionesQuery,
  type EventosQuery,
  type PoligonoBody,
} from './analisis.schemas.js';
import { AnalisisService, type Respuesta } from './analisis.service.js';

/** Detecciones, búsquedas por polígono dibujado y eventos del esquema fuego. */
@Controller()
export class DeteccionesController {
  constructor(private readonly analisis: AnalisisService) {}

  @Get('detecciones')
  @ApiTags('detecciones')
  @ApiOperation({
    summary: 'Detecciones filtradas, con descarga CSV o GeoJSON',
    description:
      'Una fila es una detección, no un incendio. El total va en la cabecera X-Total-Count y el siguiente offset en ' +
      'X-Next-Offset. Orden estable por fecha UTC e id_deteccion. Solo hay datos del Parque Tunari y del municipio de Cochabamba.',
  })
  async detecciones(@Query({ schema: deteccionesSchema }) q: DeteccionesQuery, @Res({ passthrough: true }) res: Response) {
    return enviar(res, await this.analisis.detecciones(q));
  }

  @Post('detecciones/buscar')
  @HttpCode(200)
  @ApiTags('detecciones')
  @ApiOperation({
    summary: 'Detecciones dentro de un polígono dibujado por el usuario',
    description: 'Fuera del parque y del municipio el resultado es vacío (advertencia `solo_areas_cargadas`).',
  })
  async buscar(@Body({ schema: buscarDeteccionesSchema }) body: BuscarDeteccionesBody, @Res({ passthrough: true }) res: Response) {
    return enviar(res, await this.analisis.buscarDetecciones(body));
  }

  @Post('conteos/mensual')
  @HttpCode(200)
  @ApiTags('series')
  @ApiOperation({
    summary: 'Conteo mensual BRUTO por fuente dentro de un polígono',
    description: 'No está armonizado ni calibrado; para el índice armonizado use /poligono/serie-armonizada.',
  })
  conteoMensual(@Body({ schema: poligonoBodySchema }) body: PoligonoBody) {
    return this.analisis.conteoMensual(body);
  }

  @Post('poligono/serie-armonizada')
  @HttpCode(200)
  @ApiTags('series')
  @ApiOperation({
    summary: 'Serie mensual armonizada de un polígono dibujado',
    description:
      'Factores calibrados en el Tunari: en polígonos pequeños el resultado es ruidoso. `sin_cobertura = true` significa ' +
      'que no hay datos, no cero incendios. Mostrar siempre `aviso`.',
  })
  serieArmonizadaPoligono(@Body({ schema: poligonoBodySchema }) body: PoligonoBody) {
    return this.analisis.serieArmonizadaPoligono(body);
  }

  @Get('eventos')
  @ApiTags('detecciones')
  @ApiOperation({ summary: 'Eventos candidatos (detecciones cercanas en tiempo y espacio)' })
  eventos(@Query({ schema: eventosSchema }) q: EventosQuery) {
    return this.analisis.eventos(q);
  }
}

function enviar(res: Response, { cuerpo, tipo, cabeceras }: Respuesta): unknown {
  for (const [nombre, valor] of Object.entries(cabeceras ?? {})) res.setHeader(nombre, valor);
  if (tipo) res.type(tipo);
  // El navegador solo deja leer cabeceras propias si se exponen en CORS.
  res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Next-Offset, Content-Disposition');
  return typeof cuerpo === 'string' ? cuerpo : tipo ? JSON.stringify(cuerpo) : cuerpo;
}
