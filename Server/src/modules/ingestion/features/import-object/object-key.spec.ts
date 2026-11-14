import { buildCsvObjectKey } from './object-key.js';

const now = new Date('2026-11-13T15:00:00Z');

describe('buildCsvObjectKey', () => {
  it('agrupa por fecha y antepone un id', () => {
    expect(buildCsvObjectKey('fire_nrt_J1V-C2_123.csv', now, 'abcd1234')).toBe(
      'csv/2026-11-13/abcd1234-fire_nrt_J1V-C2_123.csv',
    );
  });

  it('sanea rutas, acentos, espacios y caracteres raros', () => {
    expect(buildCsvObjectKey('C:\\datos\\Cochabamba áreas 2024 (v2).CSV', now, 'id')).toBe(
      'csv/2026-11-13/id-Cochabamba-areas-2024-v2.csv',
    );
    expect(buildCsvObjectKey('../../etc/passwd', now, 'id')).toBe('csv/2026-11-13/id-passwd.csv');
  });

  it('usa un nombre por defecto si no queda nada útil', () => {
    expect(buildCsvObjectKey('???.csv', now, 'id')).toBe('csv/2026-11-13/id-archivo.csv');
  });
});
