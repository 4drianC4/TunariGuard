import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DISTRICTS_UPDATED, type DistrictsUpdatedEvent } from '../../shared/domain-events.js';
import type { FeatureCollection } from 'geojson';
import { ObservationsService } from '../observations/observations.service.js';
import { extractDistricts } from './domain/district-feature.js';
import { DistrictsRepository, type DistrictRow } from './districts.repository.js';
import type { ImportDistrictsBody } from './districts.schemas.js';

@Injectable()
export class DistrictsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DistrictsService.name);

  constructor(
    private readonly repository: DistrictsRepository,
    private readonly observations: ObservationsService,
    private readonly events: EventEmitter2,
  ) {}

  /** Importa polígonos y vuelve a evaluar la pertenencia de todas las observaciones. */
  async import(file: Buffer, body: ImportDistrictsBody) {
    let districts;
    try {
      districts = extractDistricts(JSON.parse(file.toString('utf8')), body);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }

    const imported = await this.repository.upsertMany(districts, body);
    return this.reassign(imported);
  }

  /** Usa los 15 distritos del paquete de datos (fuego.areas) como límites de la app. */
  async importFromFuego(replace: boolean) {
    if (!(await this.repository.fuegoDisponible())) {
      throw new ServiceUnavailableException('El esquema fuego no está cargado. Ejecuta en Server/: npm run fuego:setup');
    }
    // Sin replace, agregar los de fuego dejaría dos juegos de polígonos solapados: no se toca nada.
    const ajenos = await this.repository.codesOutsideFuego();
    if (ajenos.length > 0 && !replace) {
      throw new ConflictException(
        `Hay ${ajenos.length} distritos con códigos que no vienen de fuego.areas (${ajenos.slice(0, 5).join(', ')}` +
          `${ajenos.length > 5 ? ', …' : ''}). Para reemplazarlos por los 15 del paquete usa replace=true; no se modificó nada.`,
      );
    }
    const { imported, removed } = await this.repository.upsertFromFuego(replace);
    return { ...(await this.reassign(imported)), removed };
  }

  /**
   * Al arrancar, si todavía no hay distritos y el paquete fuego está cargado, los toma de ahí.
   * Así el mapa tiene distritos sin pasos manuales. Nunca reemplaza distritos ya cargados.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      if ((await this.repository.count()) > 0 || !(await this.repository.fuegoDisponible())) return;
      const { imported } = await this.importFromFuego(false);
      this.logger.log(`Sin distritos cargados: se importaron ${imported} desde fuego.areas`);
    } catch (error) {
      // Sin base de datos al arrancar: PrismaService ya avisa con un mensaje claro.
      this.logger.debug(`No se importaron distritos al arrancar: ${String(error)}`);
    }
  }

  private async reassign(imported: number) {
    const assignment = await this.observations.assignDistricts();
    this.events.emit(DISTRICTS_UPDATED, {
      imported,
      reassigned: assignment.evaluated,
      updatedAtUtc: new Date().toISOString(),
    } satisfies DistrictsUpdatedEvent);
    return { imported, assignment };
  }

  list() {
    return this.repository.list().then((rows) => rows.map(toDto));
  }

  async listGeoJson(): Promise<FeatureCollection> {
    const rows = await this.repository.listGeoJson();
    return {
      type: 'FeatureCollection',
      features: rows.map(({ geometry, ...row }) => ({
        type: 'Feature',
        id: row.code,
        geometry: JSON.parse(geometry) as FeatureCollection['features'][number]['geometry'],
        properties: toDto(row),
      })),
    };
  }
}

function toDto(row: DistrictRow) {
  return {
    id: row.code,
    name: row.name,
    hotspotCount: row.observationCount,
    areaKm2: row.areaKm2,
    source: row.source,
    version: row.version,
    provisional: row.provisional,
    importedAtUtc: row.importedAt.toISOString(),
  };
}
