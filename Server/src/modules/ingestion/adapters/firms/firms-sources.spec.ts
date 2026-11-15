import { DEFAULT_BBOX, FIRMS_SOURCES, firmsUrl, inBbox, parseCsv, toCsv } from './firms-sources.js';

const CSV = `latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
-17.3,-66.2,335.1,0.4,0.37,2026-11-15,1801,N20,n,2.0NRT,300.1,4.2,D
-27.99,-62.75,314.9,0.4,0.37,2026-11-15,0058,N20,n,2.0NRT,286.3,14.2,N
-16.8838,-65.886,330.0,0.4,0.37,2026-11-15,1802,N20,h,2.0NRT,301.0,9.0,D
`;

describe('firms-sources', () => {
  it('arma la URL pública (sin clave) o la de la API por área (con MAP_KEY)', () => {
    const noaa20 = FIRMS_SOURCES[0]!;
    expect(firmsUrl(noaa20, DEFAULT_BBOX)).toBe(
      'https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv',
    );
    expect(firmsUrl(noaa20, DEFAULT_BBOX, 'abc123')).toBe(
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/abc123/VIIRS_NOAA20_NRT/-66.7556,-17.5763,-65.8860,-16.8838/1',
    );
  });

  it('filtra por la zona (bordes incluidos) y rearma el CSV con las columnas originales', () => {
    const { columns, rows } = parseCsv(CSV);
    const zona = inBbox(rows, DEFAULT_BBOX);
    expect(zona.map((r) => r['acq_time'])).toEqual(['1801', '1802']);
    const csv = toCsv(columns, zona);
    expect(csv.split('\n')[0]).toBe(columns.join(','));
    expect(parseCsv(csv).rows).toEqual(zona);
  });

  it('acepta un archivo vacío (solo cabecera)', () => {
    const { columns, rows } = parseCsv('latitude,longitude,acq_date\n');
    expect(columns).toEqual(['latitude', 'longitude', 'acq_date']);
    expect(rows).toEqual([]);
  });
});
