import { problemaDePoligono } from './poligono.js';

const cuadrado = [[[-66.2, -17.4], [-66.1, -17.4], [-66.1, -17.3], [-66.2, -17.3], [-66.2, -17.4]]];

describe('problemaDePoligono', () => {
  it('acepta Polygon y MultiPolygon válidos', () => {
    expect(problemaDePoligono({ type: 'Polygon', coordinates: cuadrado })).toBeNull();
    expect(problemaDePoligono({ type: 'MultiPolygon', coordinates: [cuadrado, cuadrado] })).toBeNull();
  });

  it('rechaza anillos cortos, abiertos o con coordenadas fuera de rango', () => {
    expect(problemaDePoligono({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })).toMatch(/al menos 4/);
    expect(problemaDePoligono({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toMatch(/no está cerrado/);
    expect(problemaDePoligono({ type: 'Polygon', coordinates: [[[500000, 8000000], [1, 0], [1, 1], [500000, 8000000]]] })).toMatch(/WGS84/);
    expect(problemaDePoligono({ type: 'MultiPolygon', coordinates: [cuadrado, []] })).toMatch(/polígono 1 no tiene anillos/);
  });
});
