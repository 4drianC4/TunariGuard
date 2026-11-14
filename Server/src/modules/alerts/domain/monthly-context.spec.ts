import { monthlyContext, type MonthlyAlertRow } from './monthly-context.js';

const base: MonthlyAlertRow = {
  area_id: 'parque-tunari',
  nombre_visible: 'Parque Nacional Tunari',
  fecha_corte: '2026-11-12',
  mes: '2026-11-01',
  dias_transcurridos: 12,
  celdas_dia_observadas: 14,
  esperado_modelo: 3.47,
  probabilidad_exceso: 0.004,
  satelite_base: 'NOAA-20',
  nivel_alerta: 'muy_alta',
  lectura: 'Extremadamente inusual para este tramo del mes',
};

describe('monthlyContext', () => {
  it('arma el mensaje de muy_alta sin decir "una vez cada N años"', () => {
    const c = monthlyContext(base);
    expect(c).toMatchObject({ severity: 'Crítica', isAlert: true, title: 'Actividad extremadamente inusual' });
    expect(c.message).toBe(
      'Actividad extremadamente inusual en Parque Nacional Tunari: en los primeros 12 días de noviembre de 2026 ' +
        'se registraron 14 celdas-día de calor (NOAA-20), cuando lo esperable según el modelo era ~3.5. ' +
        'Un tramo así o más alto ocurre en el 1 % de los casos o menos (según el modelo). ' +
        'Es una señal estadística: requiere verificación y no confirma un incendio.',
    );
    expect(c.message).not.toMatch(/cada \d+ años/);
  });

  it('usa el umbral de cada nivel y no alerta en normal ni sin historial', () => {
    expect(monthlyContext({ ...base, nivel_alerta: 'alta' }).message).toMatch(/5 % de los casos/);
    expect(monthlyContext({ ...base, nivel_alerta: 'elevada' })).toMatchObject({ severity: 'Media', isAlert: true });
    const normal = monthlyContext({ ...base, nivel_alerta: 'normal', celdas_dia_observadas: 1 });
    expect(normal).toMatchObject({ severity: null, isAlert: false });
    expect(normal.message).toMatch(/1 celda-día de calor .*Dentro de lo esperable para este tramo del mes\.$/);
    expect(monthlyContext({ ...base, nivel_alerta: 'sin_baseline' }).message).toMatch(/No hay suficientes años/);
  });
});
