import { z } from 'zod';

/** Lista separada por comas → string[] sin vacíos. */
const commaList = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** Cadena opcional: una variable vacía en .env se trata como ausente. */
const optionalString = z
  .string()
  .optional()
  .transform((value) => (value?.trim() ? value.trim() : undefined));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGINS: commaList,
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Almacenamiento S3 (MinIO en desarrollo) para los CSV pesados.
  S3_ENDPOINT: z.url({ protocol: /^https?$/ }),
  /** Host con el que se firman las URLs de subida, si el cliente no ve S3_ENDPOINT. */
  S3_PUBLIC_ENDPOINT: optionalString.pipe(z.url({ protocol: /^https?$/ }).optional()),
  S3_REGION: z.string().trim().min(1).default('us-east-1'),
  S3_ACCESS_KEY: z.string().trim().min(1),
  S3_SECRET_KEY: z.string().trim().min(1),
  S3_BUCKET: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Nombre de bucket S3 inválido')
    .default('tunari-guard-uploads'),

  // Integraciones de fases siguientes; opcionales para que la app arranque sin ellas.
  FIRMS_MAP_KEY: optionalString,
  LLM_API_KEY: optionalString,
  N8N_ALERT_WEBHOOK_URL: optionalString,
});

export type Env = z.infer<typeof envSchema>;
