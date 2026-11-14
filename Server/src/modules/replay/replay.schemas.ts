import { z } from 'zod';

const isoDate = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value));

export const startReplaySchema = z
  .object({
    from: isoDate.optional().describe('Inicio del periodo histórico (ISO 8601)'),
    to: isoDate.optional().describe('Fin del periodo histórico (ISO 8601)'),
    sensor: z.enum(['MODIS', 'VIIRS']).optional(),
    district: z.string().trim().min(1).optional().describe('Código de distrito'),
    batchId: z.uuid().optional().describe('Reproducir solo un lote importado'),
    intervalMs: z.number().int().min(500).max(60_000).default(3000).describe('Pausa entre pasadas'),
    passWindowMinutes: z
      .number()
      .int()
      .min(1)
      .max(180)
      .default(20)
      .describe('Detecciones a menos de estos minutos forman una misma pasada'),
    loop: z.boolean().default(false).describe('Volver a empezar al terminar (modo kiosco)'),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, { message: 'from debe ser anterior a to', path: ['from'] });

export type StartReplayBody = z.infer<typeof startReplaySchema>;
