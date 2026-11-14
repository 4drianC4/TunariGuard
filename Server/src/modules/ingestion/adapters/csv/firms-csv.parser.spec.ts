import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { NormalizedObservation } from '../../domain/normalized-observation.js';
import { CsvFormatError, readFirmsCsv, type FirmsCsvOptions } from './firms-csv.parser.js';

/** Lee todo el CSV y junta los bloques, para comparar resultados completos. */
async function parseFirmsCsv(content: string | Readable, options: Partial<FirmsCsvOptions> = {}) {
  const observations: NormalizedObservation[] = [];
  const chunks: number[] = [];
  const summary = await readFirmsCsv(content, {
    ...options,
    onChunk: async (chunk) => {
      chunks.push(chunk.length);
      observations.push(...chunk);
    },
  });
  return { ...summary, observations, chunks };
}

const MODIS_CSV = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
-17.3895,-66.1568,318.4,1.0,1.0,2024-09-10,1420,Terra,MODIS,85,6.1NRT,295.2,12.7,D
-17.4012,-66.1201,305.1,1.1,1.0,2024-09-10,0335,Aqua,MODIS,25,6.1NRT,289.0,4.1,N
`;

const VIIRS_CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
-17.38951,-66.15682,330.2,0.39,0.36,2024-09-10,545,N,VIIRS,h,2.0NRT,290.1,3.2,N
-17.39,-66.15,320.0,0.4,0.37,2024-09-10,1801,N20,VIIRS,n,2.0NRT,291.0,1.5,D
-17.39,-66.15,320.0,0.4,0.37,2024-09-10,1802,1,VIIRS,l,2.0NRT,291.0,1.5,D
`;

describe('readFirmsCsv', () => {
  it('normaliza MODIS: plataforma, hora UTC y clases de confianza', async () => {
    const { rowsTotal, observations, errors } = await parseFirmsCsv(MODIS_CSV);
    expect(rowsTotal).toBe(2);
    expect(errors).toEqual([]);

    const [terra, aqua] = observations;
    expect(terra).toMatchObject({
      sensor: 'MODIS',
      platform: 'TERRA',
      latitude: -17.3895,
      longitude: -66.1568,
      confidenceRaw: '85',
      confidenceLevel: 'HIGH',
      brightnessK: 318.4,
      brightnessAuxK: 295.2,
      frpMw: 12.7,
      dayNight: 'DAY',
      productVersion: '6.1NRT',
    });
    expect(terra?.acquiredAt.toISOString()).toBe('2024-09-10T14:20:00.000Z');
    expect(aqua).toMatchObject({ platform: 'AQUA', confidenceLevel: 'LOW', dayNight: 'NIGHT' });
    expect(terra?.raw['confidence']).toBe('85');
  });

  it('normaliza VIIRS: alias de satélite, l/n/h y horas sin ceros a la izquierda', async () => {
    const { observations, errors } = await parseFirmsCsv(VIIRS_CSV);
    expect(errors).toEqual([]);
    expect(observations.map((o) => o.platform)).toEqual(['SNPP', 'NOAA20', 'NOAA20']);
    expect(observations.map((o) => o.confidenceLevel)).toEqual(['HIGH', 'NOMINAL', 'LOW']);
    expect(observations[0]?.acquiredAt.toISOString()).toBe('2024-09-10T05:45:00.000Z');
    expect(observations[0]?.brightnessK).toBe(330.2);
  });

  it('genera la misma huella para la misma detección, independiente de decimales extra', async () => {
    const a = (await parseFirmsCsv(VIIRS_CSV)).observations[0];
    const b = (await parseFirmsCsv(VIIRS_CSV.replace('-17.38951', '-17.389510'))).observations[0];
    expect(a?.dedupeKey).toBe(b?.dedupeKey);
    expect(a?.dedupeKey).toBe('VIIRS|SNPP|2024-09-10T05:45:00.000Z|-17.38951|-66.15682');
  });

  it('reporta filas inválidas o repetidas con su línea sin detener el lote', async () => {
    const csv =
      MODIS_CSV +
      '-95,-66.1,300,1,1,2024-09-10,1200,Terra,MODIS,50,6.1,290,1,D\n' +
      '-17.3,-66.1,300,1,1,2024-02-30,1200,Terra,MODIS,50,6.1,290,1,D\n' +
      '-17.3,-66.1,300,1,1,2024-09-10,1200,N,MODIS,50,6.1,290,1,D\n' +
      '-17.3895,-66.1568,318.4,1.0,1.0,2024-09-10,1420,Terra,MODIS,85,6.1NRT,295.2,12.7,D\n';
    const { rowsTotal, observations, errors } = await parseFirmsCsv(csv);
    expect(rowsTotal).toBe(6);
    expect(observations).toHaveLength(2);
    expect(errors.map((e) => e.line)).toEqual([4, 5, 6, 7]);
    expect(errors[0]?.message).toMatch(/latitude/);
    expect(errors[1]?.message).toMatch(/acq_date/);
    expect(errors[2]?.message).toMatch(/no corresponde al sensor/);
    expect(errors[3]?.message).toMatch(/repetida/);
  });

  it('lee el tipo de detección FIRMS (type) y rechaza valores inválidos', async () => {
    const csv =
      'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type\n' +
      '-17.5,-66.2,335,0.39,0.36,2012-04-02,1756,N,VIIRS,n,2,302,3.7,D,0\n' +
      '-17.6,-66.2,335,0.39,0.36,2012-04-02,1756,N,VIIRS,n,2,302,3.7,D,2\n' +
      '-17.7,-66.2,335,0.39,0.36,2012-04-02,1756,N,VIIRS,n,2.0NRT,302,3.7,D,\n' +
      '-17.8,-66.2,335,0.39,0.36,2012-04-02,1756,N,VIIRS,n,2,302,3.7,D,7\n';
    const { observations, errors } = await parseFirmsCsv(csv);
    expect(observations.map((o) => o.detectionType)).toEqual([0, 2, null]);
    expect(errors).toEqual([{ line: 5, message: 'type inválido: 7 (se espera 0, 1, 2 o 3)' }]);
  });

  it('rechaza archivos que no son FIRMS o no son CSV', async () => {
    await expect(parseFirmsCsv('nombre,valor\na,1\n')).rejects.toThrow(/faltan columnas/);
    await expect(parseFirmsCsv(MODIS_CSV + '"sin cerrar,1\n')).rejects.toBeInstanceOf(CsvFormatError);
  });

  it('acepta un archivo vacío', async () => {
    const result = await parseFirmsCsv('');
    expect(result).toMatchObject({ rowsTotal: 0, accepted: 0, rejected: 0, observations: [], errors: [] });
  });

  it('entrega bloques del tamaño pedido desde un stream y calcula la huella del archivo', async () => {
    const [header, ...rows] = VIIRS_CSV.trim().split('\n');
    const pieces = [`${header}\n`, ...rows.map((row) => `${row}\n`)];
    const result = await parseFirmsCsv(Readable.from(pieces), { chunkSize: 2 });
    expect(result.chunks).toEqual([2, 1]);
    expect(result.accepted).toBe(3);
    expect(result.bytes).toBe(Buffer.byteLength(VIIRS_CSV));
    expect(result.checksum).toBe(createHash('sha256').update(VIIRS_CSV).digest('hex'));
  });

  it('cuenta todas las filas rechazadas aunque solo guarde el detalle de las primeras', async () => {
    const bad = '-95,-66.1,300,1,1,2024-09-10,1200,Terra,MODIS,50,6.1,290,1,D\n'.repeat(5);
    const result = await parseFirmsCsv(MODIS_CSV + bad, { maxErrors: 2 });
    expect(result.rejected).toBe(5);
    expect(result.errors).toHaveLength(2);
  });
});
