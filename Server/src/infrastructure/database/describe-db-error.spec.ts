import { describeDbError } from './describe-db-error.js';

const url = 'postgresql://tunari:secreto@127.0.0.1:5433/tunari_guard';

describe('describeDbError', () => {
  it('explica la contraseña rechazada sin filtrar la contraseña', () => {
    const message = describeDbError(Object.assign(new Error('x'), { code: '28P01' }), url);
    expect(message).toMatch(/127\.0\.0\.1:5433/);
    expect(message).toMatch(/DB_PORT=5433/);
    expect(message).not.toMatch(/secreto/);
  });

  it('encuentra el código aunque venga anidado o solo en el mensaje', () => {
    const nested = new Error('falló', { cause: new Error('password authentication failed for user "tunari"') });
    expect(describeDbError(nested, url)).toMatch(/rechazó el usuario/);
    expect(describeDbError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }), url)).toMatch(/npm run db:up/);
  });
});
