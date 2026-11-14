import { agruparPorArea, registroArmonizado, registroDeSensor, resumir } from './historial.js';

const fila = {
  area_id: 'parque-tunari',
  mes: '2024-08-01',
  detecciones: 107,
  celdas_dia: 47,
  provisional: false,
  por_fuente: { 'VIIRS-Suomi-NPP': 60, 'VIIRS-NOAA-20': 47 },
};

describe('historial', () => {
  it('convierte un mes de un sensor a HistoricalRecord según la medida', () => {
    expect(registroDeSensor(fila, 'VIIRS', 'celdas_dia')).toEqual({
      year: 2024,
      month: 8,
      source: 'VIIRS',
      activityCount: 47,
      origin: 'NASA_FIRMS',
      detections: 107,
      cellDays: 47,
      bySatellite: fila.por_fuente,
      provisional: false,
    });
    expect(registroDeSensor(fila, 'VIIRS', 'detecciones').activityCount).toBe(107);
  });

  it('conserva el null del índice armonizado (sin valor comparable)', () => {
    const r = registroArmonizado({ area_id: 'distrito-09', mes: '2005-03-01', indice: null, calidad_indice: 'no_comparable' });
    expect(r).toMatchObject({ year: 2005, month: 3, source: 'HARMONIZED', activityCount: null, quality: 'no_comparable' });
  });

  it('resume ignorando los meses sin valor', () => {
    const base = { source: 'HARMONIZED', origin: 'NASA_FIRMS' } as const;
    const resumen = resumir([
      { ...base, year: 2011, month: 1, activityCount: null },
      { ...base, year: 2012, month: 8, activityCount: 2.5 },
      { ...base, year: 2012, month: 9, activityCount: 4.25 },
      { ...base, year: 2013, month: 9, activityCount: 0 },
    ]);
    expect(resumen).toEqual({
      total: 6.75,
      monthsWithData: 3,
      monthlyAverage: 2.25,
      peak: { year: 2012, month: 9, activityCount: 4.25 },
    });
    expect(resumir([])).toEqual({ total: 0, monthsWithData: 0, monthlyAverage: 0, peak: null });
  });

  it('agrupa por área en orden', () => {
    const grupos = agruparPorArea([{ area_id: 'b' }, { area_id: 'a' }, { area_id: 'b' }]);
    expect([...grupos.keys()]).toEqual(['b', 'a']);
    expect(grupos.get('b')).toHaveLength(2);
  });
});
