import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../../infrastructure/config/env.schema.js';
import { FIRMS_SOURCES, firmsUrl, inBbox, parseCsv, toCsv, type Bbox, type FirmsSource } from '../../adapters/firms/firms-sources.js';
import { FirmsRepository } from '../../adapters/persistence/firms.repository.js';
import { normalizeFirmsRecord } from '../../domain/normalize-firms-record.js';
import { ImportCsvService } from '../import-csv/import-csv.service.js';

const FETCH_TIMEOUT_MS = 60_000;
/** Primera sincronización poco después de arrancar (deja terminar el arranque). */
const FIRST_RUN_DELAY_MS = 30_000;

export interface SourceResult {
  source: string;
  /** Filas que trajo FIRMS (toda Sudamérica sin clave; solo la zona con MAP_KEY). */
  rows: number;
  inZone: number;
  /** Detecciones de la zona que todavía no estaban en la base. */
  new: number;
  inserted: number;
  batchId: string | null;
  error: string | null;
}

export interface SyncRun {
  trigger: 'automatica' | 'manual';
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  bbox: Bbox;
  inserted: number;
  sources: SourceResult[];
}

/**
 * Sincronización periódica con NASA FIRMS (casi tiempo real, NRT). Cada FIRMS_SYNC_INTERVAL_MINUTES
 * descarga las últimas 24 h de cada satélite, filtra el parque y el municipio, descarta lo que ya
 * está en la base y pasa lo nuevo por el importador de siempre: así las detecciones nuevas generan
 * sus alertas (BATCH_COMPLETED → AlertsService) y llegan al mapa en tiempo real.
 * Es dato REAL y provisional (NRT): nunca dispara el reemplazo de NRT por rango.
 */
@Injectable()
export class FirmsSyncService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FirmsSyncService.name);
  private readonly enabled: boolean;
  private readonly intervalMs: number;
  private readonly mapKey: string | undefined;
  private timer: NodeJS.Timeout | null = null;
  private firstRun: NodeJS.Timeout | null = null;
  private running: Promise<SyncRun> | null = null;
  private last: SyncRun | null = null;
  private lastError: string | null = null;
  private nextRunAt: Date | null = null;
  private runs = 0;

  constructor(
    config: ConfigService<Env, true>,
    private readonly repository: FirmsRepository,
    private readonly importCsv: ImportCsvService,
  ) {
    this.enabled = config.get('FIRMS_SYNC_ENABLED', { infer: true }) ?? config.get('NODE_ENV', { infer: true }) === 'production';
    this.intervalMs = config.get('FIRMS_SYNC_INTERVAL_MINUTES', { infer: true }) * 60_000;
    this.mapKey = config.get('FIRMS_MAP_KEY', { infer: true });
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('Sincronización con NASA FIRMS desactivada (FIRMS_SYNC_ENABLED=false). Se puede lanzar a mano.');
      return;
    }
    this.logger.log(
      `Sincronización con NASA FIRMS cada ${this.intervalMs / 60_000} min (${this.mapKey ? 'API por área con MAP_KEY' : 'archivos públicos 24 h'})`,
    );
    this.nextRunAt = new Date(Date.now() + FIRST_RUN_DELAY_MS);
    this.firstRun = setTimeout(() => void this.sync('automatica').catch(() => undefined), FIRST_RUN_DELAY_MS);
    this.firstRun.unref();
    this.timer = setInterval(() => void this.sync('automatica').catch(() => undefined), this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.firstRun) clearTimeout(this.firstRun);
    if (this.timer) clearInterval(this.timer);
  }

  status() {
    return {
      enabled: this.enabled,
      intervalMinutes: this.intervalMs / 60_000,
      mode: this.mapKey ? 'map_key' : 'public',
      running: this.running !== null,
      runs: this.runs,
      nextRunAt: this.enabled ? this.nextRunAt?.toISOString() ?? null : null,
      lastError: this.lastError,
      last: this.last,
    };
  }

  /** Una sincronización. Si ya hay una en curso, devuelve esa (no se solapan). */
  sync(trigger: SyncRun['trigger']): Promise<SyncRun> {
    this.running ??= this.run(trigger).finally(() => {
      this.running = null;
      if (this.enabled) this.nextRunAt = new Date(Date.now() + this.intervalMs);
    });
    return this.running;
  }

  private async run(trigger: SyncRun['trigger']): Promise<SyncRun> {
    const started = new Date();
    try {
      const bbox = await this.repository.zoneBbox();
      const sources: SourceResult[] = [];
      for (const source of FIRMS_SOURCES) sources.push(await this.syncSource(source, bbox));

      const run: SyncRun = {
        trigger,
        startedAt: started.toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - started.getTime(),
        bbox,
        inserted: sources.reduce((t, s) => t + s.inserted, 0),
        sources,
      };
      this.last = run;
      this.runs++;
      this.lastError = sources.every((s) => s.error) ? 'Ninguna fuente de FIRMS respondió' : null;
      this.logger.log(
        `FIRMS (${trigger}): ${sources.map((s) => `${s.source} ${s.error ? 'ERROR' : `${s.inZone} en la zona/${s.new} nuevas`}`).join(' · ')} ` +
          `→ ${run.inserted} insertadas (${run.durationMs} ms)`,
      );
      return run;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falló la sincronización con FIRMS: ${this.lastError}`);
      throw error;
    }
  }

  private async syncSource(source: FirmsSource, bbox: Bbox): Promise<SourceResult> {
    const result: SourceResult = { source: source.label, rows: 0, inZone: 0, new: 0, inserted: 0, batchId: null, error: null };
    try {
      const res = await fetch(firmsUrl(source, bbox, this.mapKey), { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // La API por área responde texto plano con el error (p. ej. MAP_KEY inválida) en lugar de CSV.
      if (!text.trimStart().toLowerCase().startsWith('latitude')) throw new Error(`Respuesta inesperada: ${text.slice(0, 120)}`);

      const { columns, rows } = parseCsv(text);
      result.rows = rows.length;
      const zone = inBbox(rows, bbox);
      result.inZone = zone.length;
      if (!zone.length) return result;

      // Solo lo que todavía no está en la base: evita un lote vacío en cada sincronización.
      const withKey = zone.flatMap((row) => {
        try {
          return [{ row, key: normalizeFirmsRecord(row, source.sensor).dedupeKey }];
        } catch {
          return []; // fila inválida: el importador también la rechazaría
        }
      });
      const known = await this.repository.existingKeys(withKey.map((r) => r.key));
      const fresh = withKey.filter((r) => !known.has(r.key)).map((r) => r.row);
      result.new = fresh.length;
      if (!fresh.length) return result;

      const imported = await this.importCsv.import(
        { stream: Buffer.from(toCsv(columns, fresh)), fileName: `firms:${source.id}:${new Date().toISOString().slice(0, 16)}` },
        { dataset: `NASA FIRMS ${source.label} NRT (sincronización)`, origin: 'REAL', sensor: source.sensor, replaceNrt: false },
      );
      result.inserted = imported.inserted;
      result.batchId = imported.batchId;
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      this.logger.warn(`FIRMS ${source.label}: ${result.error}`);
    }
    return result;
  }
}
