import { normalizeFirmsRecord } from '../../domain/normalize-firms-record.js';
import { DEFAULT_BBOX } from '../../adapters/firms/firms-sources.js';
import type { FirmsRepository } from '../../adapters/persistence/firms.repository.js';
import type { ImportCsvService } from '../import-csv/import-csv.service.js';
import { FirmsSyncService } from './firms-sync.service.js';

const HEADER = 'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight';
const EN_ZONA_NUEVA = '-17.30,-66.20,335.1,0.4,0.37,2026-11-15,1801,N20,n,2.0NRT,300.1,4.2,D';
const EN_ZONA_CONOCIDA = '-17.31,-66.21,335.1,0.4,0.37,2026-11-15,1801,N20,h,2.0NRT,300.1,9.0,D';
const FUERA = '-27.99,-62.75,314.9,0.4,0.37,2026-11-15,0058,N20,n,2.0NRT,286.3,14.2,N';

function setup(csvPorUrl: (url: string) => string) {
  const conocida = normalizeFirmsRecord(
    Object.fromEntries(HEADER.split(',').map((c, i) => [c, EN_ZONA_CONOCIDA.split(',')[i]!])),
    'VIIRS',
  ).dedupeKey;
  const repository = {
    zoneBbox: vi.fn().mockResolvedValue(DEFAULT_BBOX),
    existingKeys: vi.fn(async (keys: string[]) => new Set(keys.filter((k) => k === conocida))),
  };
  const importCsv = { import: vi.fn().mockResolvedValue({ inserted: 1, batchId: 'lote-1' }) };
  const config = { get: (key: string) => ({ NODE_ENV: 'test', FIRMS_SYNC_INTERVAL_MINUTES: 10 })[key] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(csvPorUrl(url))));
  const service = new FirmsSyncService(
    config as never,
    repository as unknown as FirmsRepository,
    importCsv as unknown as ImportCsvService,
  );
  return { service, repository, importCsv };
}

afterEach(() => vi.unstubAllGlobals());

describe('FirmsSyncService', () => {
  it('importa solo lo nuevo de la zona, como dato REAL sin reemplazo de NRT', async () => {
    const { service, importCsv } = setup((url) =>
      url.includes('J1_VIIRS') ? [HEADER, EN_ZONA_NUEVA, EN_ZONA_CONOCIDA, FUERA].join('\n') : HEADER + '\n',
    );
    const run = await service.sync('manual');

    const noaa20 = run.sources.find((s) => s.source === 'VIIRS NOAA-20')!;
    expect(noaa20).toMatchObject({ rows: 3, inZone: 2, new: 1, inserted: 1, batchId: 'lote-1', error: null });
    expect(run.inserted).toBe(1);
    expect(importCsv.import).toHaveBeenCalledTimes(1);

    const [[archivo, opciones]] = importCsv.import.mock.calls as [[{ stream: Buffer }, Record<string, unknown>]];
    const filas = archivo.stream.toString().trim().split('\n');
    expect(filas).toEqual([HEADER, EN_ZONA_NUEVA]);
    expect(opciones).toMatchObject({ origin: 'REAL', sensor: 'VIIRS', replaceNrt: false });
  });

  it('sin novedades en la zona no crea lotes', async () => {
    const { service, importCsv } = setup(() => [HEADER, FUERA].join('\n'));
    const run = await service.sync('manual');
    expect(run.inserted).toBe(0);
    expect(importCsv.import).not.toHaveBeenCalled();
  });

  it('una fuente caída no detiene a las demás y queda registrada', async () => {
    const { service } = setup((url) => (url.includes('MODIS') ? 'Invalid MAP_KEY.' : HEADER + '\n'));
    const run = await service.sync('manual');
    expect(run.sources.find((s) => s.source === 'MODIS Terra/Aqua')!.error).toMatch(/Respuesta inesperada/);
    expect(run.sources.filter((s) => s.error === null)).toHaveLength(3);
    expect(service.status()).toMatchObject({ enabled: false, runs: 1, lastError: null, mode: 'public' });
  });
});
