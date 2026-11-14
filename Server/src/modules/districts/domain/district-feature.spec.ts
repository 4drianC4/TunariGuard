import { extractDistricts } from './district-feature.js';

const square = (lon: number, lat: number, size = 0.05) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat + size],
      [lon, lat + size],
      [lon, lat],
    ],
  ],
});

const options = { codeProperty: 'code', nameProperty: 'name' };

describe('extractDistricts', () => {
  it('extrae código, nombre y geometría', () => {
    const result = extractDistricts(
      {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { code: 1, name: 'Distrito 1' }, geometry: square(-66.2, -17.4) },
        ],
      },
      options,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ code: '1', name: 'Distrito 1' });
    expect(JSON.parse(result[0]!.geometry)).toMatchObject({ type: 'Polygon' });
  });

  it('usa nombres de propiedad configurables', () => {
    const [district] = extractDistricts(
      {
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { DIST: 'D9', NOMBRE: 'Nueve' }, geometry: square(-66, -17) },
        ],
      },
      { codeProperty: 'DIST', nameProperty: 'NOMBRE' },
    );
    expect(district).toMatchObject({ code: 'D9', name: 'Nueve' });
  });

  it('rechaza coordenadas proyectadas, geometrías no poligonales y códigos repetidos', () => {
    const fc = (features: unknown[]) => ({ type: 'FeatureCollection', features });
    const utm = { type: 'Polygon', coordinates: [[[801234, 8075432], [801300, 8075432], [801234, 8075500], [801234, 8075432]]] };

    expect(() =>
      extractDistricts(fc([{ type: 'Feature', properties: { code: 'a', name: 'A' }, geometry: utm }]), options),
    ).toThrow(/EPSG:4326/);
    expect(() =>
      extractDistricts(
        fc([{ type: 'Feature', properties: { code: 'a', name: 'A' }, geometry: { type: 'Point', coordinates: [0, 0] } }]),
        options,
      ),
    ).toThrow(/Polygon/);
    expect(() =>
      extractDistricts(
        fc([
          { type: 'Feature', properties: { code: 'a', name: 'A' }, geometry: square(-66, -17) },
          { type: 'Feature', properties: { code: 'a', name: 'B' }, geometry: square(-65, -17) },
        ]),
        options,
      ),
    ).toThrow(/repetido/);
    expect(() => extractDistricts({ type: 'Feature' }, options)).toThrow(/FeatureCollection/);
  });
});
