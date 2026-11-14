import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapAnalysisService } from './map-analysis.service';

const period = { from: '2024-01-01', to: '2024-12-31' };
const row = {
  id_deteccion: 'archive-1', fuente: 'VIIRS-NOAA-20',
  fecha_hora_utc: '2024-07-01T14:00:00Z', lat: -17.2, lon: -66.1,
  confianza_clase: 'alta', dia_noche: 'D', origen_dato: 'estandar', evento_id_tunari: 'TUNARI-1',
};

afterEach(() => vi.unstubAllGlobals());

describe('MapAnalysisService', () => {
  it('follows the archive offset header and maps FIRMS fields without mixing sources', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json([row], { headers: { 'X-Next-Offset': '1' } }))
      .mockResolvedValueOnce(Response.json([{ ...row, id_deteccion: 'archive-2' }]));
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    const result = await new MapAnalysisService().detections(
      'parque-tunari', period, '-67,-18,-65,-16', undefined, ['NOAA20'], 'HIGH', false, signal,
    );
    expect(fetch.mock.calls[0][0]).toContain('fuente=VIIRS-NOAA-20');
    expect(fetch.mock.calls[1][0]).toContain('offset=1');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      platform: 'NOAA20', confidenceLevel: 'HIGH', dayNight: 'DAY',
      position: { lat: -17.2, lng: -66.1 }, archive: { events: ['TUNARI-1'] },
    });
  });

  it('posts the drawn polygon and filters persistent sources in polygon results', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json([row, { ...row, fuente_persistente_probable: true }]));
    vi.stubGlobal('fetch', fetch);
    const polygon = { type: 'Polygon' as const, coordinates: [[[-67, -18], [-65, -18], [-65, -16], [-67, -18]]] };
    const result = await new MapAnalysisService().detections(
      'parque-tunari', period, '', polygon, ['NOAA20'], '', true, new AbortController().signal,
    );
    expect(fetch.mock.calls[0][0]).toMatch(/\/detecciones\/buscar$/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      poligono: polygon, desde: period.from, hasta: period.to, fuentes: ['VIIRS-NOAA-20'],
    });
    expect(result).toHaveLength(1);
  });
});
