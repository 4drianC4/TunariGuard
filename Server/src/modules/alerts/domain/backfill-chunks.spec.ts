import { chunkAtGaps } from './backfill-chunks.js';

const at = (id: string, iso: string) => ({ id, acquiredAt: new Date(iso) });

describe('chunkAtGaps', () => {
  it('devuelve una lista vacía sin observaciones', () => {
    expect(chunkAtGaps([], 3, 20)).toEqual([]);
  });

  it('no corta una pasada aunque se supere el tamaño máximo', () => {
    const rows = [at('a', '2020-08-01T10:00:00Z'), at('b', '2020-08-01T10:05:00Z'), at('c', '2020-08-01T10:10:00Z'), at('d', '2020-08-01T10:15:00Z')];
    expect(chunkAtGaps(rows, 2, 20)).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('corta solo donde hay un hueco mayor al de una pasada y ya se alcanzó el tamaño', () => {
    const rows = [at('a', '2020-08-01T10:00:00Z'), at('b', '2020-08-01T10:05:00Z'), at('c', '2020-08-01T12:00:00Z'), at('d', '2020-08-01T12:05:00Z')];
    expect(chunkAtGaps(rows, 2, 20)).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('no corta un hueco grande si el bloque todavía es chico', () => {
    const rows = [at('a', '2020-08-01T10:00:00Z'), at('b', '2020-08-01T14:00:00Z'), at('c', '2020-08-01T14:05:00Z')];
    expect(chunkAtGaps(rows, 3, 20)).toEqual([['a', 'b', 'c']]);
  });

  it('conserva todos los ids y su orden', () => {
    const rows = Array.from({ length: 10 }, (_, i) => at(`id${i}`, `2020-08-0${(i % 9) + 1}T10:00:00Z`)).sort((x, y) => x.acquiredAt.getTime() - y.acquiredAt.getTime());
    expect(chunkAtGaps(rows, 3, 20).flat()).toEqual(rows.map((r) => r.id));
  });
});
