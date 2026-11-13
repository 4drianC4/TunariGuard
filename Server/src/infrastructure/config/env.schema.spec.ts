import { envSchema } from './env.schema.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('envSchema', () => {
  it('aplica valores por defecto', () => {
    const env = envSchema.parse(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
  });

  it('convierte CORS_ORIGINS en lista y PORT en número', () => {
    const env = envSchema.parse({
      ...base,
      PORT: '8080',
      CORS_ORIGINS: 'http://localhost:4200, https://tunari.example ,',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200', 'https://tunari.example']);
  });

  it('trata claves vacías como ausentes', () => {
    const env = envSchema.parse({ ...base, LLM_API_KEY: '  ' });
    expect(env.LLM_API_KEY).toBeUndefined();
  });

  it('rechaza una DATABASE_URL ausente o que no es PostgreSQL', () => {
    expect(envSchema.safeParse({}).success).toBe(false);
    expect(envSchema.safeParse({ DATABASE_URL: 'mysql://u:p@localhost/db' }).success).toBe(false);
  });
});
