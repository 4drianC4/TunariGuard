import { chunk, fanOutByDistrict } from './fan-out.js';

const f = (id: string, code: string | null) => ({ id, properties: { district: code ? { code } : null } });

describe('fanOutByDistrict', () => {
  it('envía todo a la sala general y a cada distrito solo lo suyo', () => {
    const rooms = fanOutByDistrict([f('a', 'D1'), f('b', 'D2'), f('c', null), f('d', 'D1')]);
    expect(rooms.get('all')?.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(rooms.get('district:D1')?.map((x) => x.id)).toEqual(['a', 'd']);
    expect(rooms.get('district:D2')?.map((x) => x.id)).toEqual(['b']);
    expect([...rooms.keys()]).toHaveLength(3);
  });

  it('no crea salas para una lista vacía', () => {
    expect(fanOutByDistrict([]).size).toBe(0);
  });
});

describe('chunk', () => {
  it('divide respetando el tamaño máximo', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
