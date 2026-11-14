import { Module } from '@nestjs/common';
import { AnalisisRepository } from './analisis.repository.js';
import { AnalisisService } from './analisis.service.js';
import { AreasController } from './areas.controller.js';
import { DeteccionesController } from './detecciones.controller.js';
import { HistorialController } from './historial.controller.js';
import { HistorialService } from './historial.service.js';
import { MetadatosController } from './metadatos.controller.js';

/**
 * Lectura del análisis ya calculado por el equipo de datos (esquema `fuego`): áreas, calendario,
 * series armonizadas, alertas, recurrencia, puntos calientes y detecciones analizadas.
 * Se instala con `npm run fuego:setup`. No recalcula nada: el índice y las alertas llegan hechos.
 */
@Module({
  controllers: [AreasController, DeteccionesController, HistorialController, MetadatosController],
  providers: [AnalisisService, HistorialService, AnalisisRepository],
  exports: [AnalisisService, HistorialService],
})
export class AnalisisModule {}
