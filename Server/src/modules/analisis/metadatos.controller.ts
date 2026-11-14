import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalisisService } from './analisis.service.js';

@ApiTags('metadatos')
@Controller()
export class MetadatosController {
  constructor(private readonly analisis: AnalisisService) {}

  @Get('metadatos')
  @ApiOperation({
    summary: 'Parámetros del análisis, cobertura y advertencias obligatorias',
    description: 'Las `advertencias` deben mostrarse junto a cada cifra en el frontend.',
  })
  metadatos() {
    return this.analisis.metadatos();
  }

  @Get('fuentes')
  @ApiOperation({ summary: 'Catálogo de satélites y sensores (qué entra al índice)' })
  fuentes() {
    return this.analisis.fuentes();
  }

  @Get('casos-documentados')
  @ApiOperation({ summary: 'Incendios publicados en prensa usados para validar (sin coordenadas)' })
  casosDocumentados() {
    return this.analisis.casosDocumentados();
  }
}
