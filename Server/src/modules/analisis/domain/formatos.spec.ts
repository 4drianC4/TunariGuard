import { aCsv, aFeatureCollection, deteccionesAFeatureCollection } from './formatos.js';

describe('aCsv', () => {
  it('escapa comillas, comas y saltos de línea, y deja vacíos los nulos', () => {
    const csv = aCsv([
      { id: 'a', texto: 'dice "hola", y\nsigue', n: 1.5, nada: null },
      { id: 'b', texto: 'simple', n: 0, nada: undefined },
    ]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1)).toBe('id,texto,n,nada\r\na,"dice ""hola"", y\nsigue",1.5,\r\nb,simple,0,\r\n');
  });

  it('con cero filas devuelve solo el BOM y una línea vacía', () => {
    expect(aCsv([])).toBe('﻿\r\n');
  });
});

describe('GeoJSON', () => {
  it('saca la geometría de las propiedades', () => {
    const fc = aFeatureCollection([{ area_id: 'x', geometria: { type: 'Point', coordinates: [1, 2] } }]);
    expect(fc.features[0]).toEqual({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
      properties: { area_id: 'x' },
    });
  });

  it('arma puntos [lon, lat] desde las detecciones', () => {
    const fc = deteccionesAFeatureCollection([{ id_deteccion: 'd1', lat: -17.3, lon: -66.1 }]);
    expect(fc.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-66.1, -17.3] });
    expect(fc.features[0]?.properties).toEqual({ id_deteccion: 'd1', lat: -17.3, lon: -66.1 });
  });
});
