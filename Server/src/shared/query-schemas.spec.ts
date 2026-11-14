import { formBoolean, queryBoolean } from './query-schemas.js';

describe('booleanos de entrada', () => {
  it('formBoolean acepta texto de formulario y booleano JSON', () => {
    expect(formBoolean.parse('false')).toBe(false);
    expect(formBoolean.parse('true')).toBe(true);
    expect(formBoolean.parse(false)).toBe(false);
    expect(formBoolean.parse(true)).toBe(true);
    expect(formBoolean.parse('0')).toBe(false);
    expect(formBoolean.safeParse('no').success).toBe(false);
  });

  it('queryBoolean no convierte "false" en true', () => {
    expect(queryBoolean.parse('false')).toBe(false);
    expect(queryBoolean.safeParse(false).success).toBe(false);
  });
});
