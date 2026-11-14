import { envSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

describe('envSchema', () => {
  it('aplica valores por defecto', () => {
    const env = envSchema.parse(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.S3_BUCKET).toBe('tunari-guard-uploads');
    expect(env.S3_PUBLIC_ENDPOINT).toBeUndefined();
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
    expect(envSchema.safeParse({ ...base, DATABASE_URL: 'mysql://u:p@localhost/db' }).success).toBe(false);
  });

  it('exige las credenciales S3 y valida el bucket', () => {
    expect(envSchema.safeParse({ ...base, S3_SECRET_KEY: undefined }).success).toBe(false);
    expect(envSchema.safeParse({ ...base, S3_BUCKET: 'Mal_Bucket' }).success).toBe(false);
    expect(envSchema.parse({ ...base, S3_PUBLIC_ENDPOINT: 'http://192.168.1.20:9000' }).S3_PUBLIC_ENDPOINT)
      .toBe('http://192.168.1.20:9000');
  });
});
