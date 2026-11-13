import { BadRequestException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DISTRICTS_UPDATED, type DistrictsUpdatedEvent } from '../../shared/domain-events.js';
import type { FeatureCollection } from 'geojson';
import { ObservationsService } from '../observations/observations.service.js';
import { extractDistricts } from './domain/district-feature.js';
import { DistrictsRepository, type DistrictRow } from './districts.repository.js';
import type { ImportDistrictsBody } from './districts.schemas.js';

@Injectable()
export class DistrictsService {
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
