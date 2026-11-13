import { groupIntoPasses } from './group-passes.js';

const at = (iso: string) => ({ properties: { acquiredAtUtc: iso } });

describe('groupIntoPasses', () => {
  it('agrupa detecciones cercanas en el tiempo y separa pasadas distintas', () => {
    const passes = groupIntoPasses(
      [
        at('2024-09-10T05:45:00.000Z'),
        at('2024-09-10T05:46:00.000Z'),
        at('2024-09-10T06:00:00.000Z'),
        at('2024-09-10T14:20:00.000Z'),
        at('2024-09-11T15:00:00.000Z'),
      ],
      20,
    );
    expect(passes.map((p) => [p.simulatedTimeUtc, p.features.length])).toEqual([
      ['2024-09-10T05:45:00.000Z', 3],
      ['2024-09-10T14:20:00.000Z', 1],
      ['2024-09-11T15:00:00.000Z', 1],
    ]);
  });

  it('mide la ventana desde la primera detección del grupo, no desde la anterior', () => {
    const passes = groupIntoPasses(
      [at('2024-01-01T00:00:00Z'), at('2024-01-01T00:15:00Z'), at('2024-01-01T00:30:00Z')],
      20,
    );
    expect(passes.map((p) => p.features.length)).toEqual([2, 1]);
  });

  it('devuelve una lista vacía sin detecciones', () => {
    expect(groupIntoPasses([], 20)).toEqual([]);
  });
});
