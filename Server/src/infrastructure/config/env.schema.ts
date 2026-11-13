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

  // Integraciones de fases siguientes; opcionales para que la app arranque sin ellas.
  FIRMS_MAP_KEY: optionalString,
  LLM_API_KEY: optionalString,
  N8N_ALERT_WEBHOOK_URL: optionalString,
});

export type Env = z.infer<typeof envSchema>;
