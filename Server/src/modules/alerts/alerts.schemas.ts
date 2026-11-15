import { z } from 'zod';
import { formBoolean, isoDay, queryBoolean } from '../../shared/query-schemas.js';

const severidad = z.enum(['Crítica', 'Alta', 'Media']);
const estado = z.enum(['Pendiente', 'En revisión', 'En análisis', 'Verificada']);

export const listAlertsSchema = z
  .object({
    desde: isoDay.optional().describe('Desde, inclusive (YYYY-MM-DD, día en hora de Bolivia)'),
    hasta: isoDay.optional().describe('Hasta, inclusive (YYYY-MM-DD)'),
    area_id: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .optional()
      .describe('distrito-09, mun-tiquipaya… · parque-tunari incluye sus sectores · municipio-cochabamba, sus 15 distritos'),
    en_parque: queryBoolean.optional().describe('true: solo alertas dentro del Parque Tunari (incluye sus sectores por municipio)'),
    severidad: severidad.optional(),
    estado: estado.optional(),
    modo: z.enum(['live', 'replay']).optional().describe('live: importaciones · replay: generadas en una reproducción (demo)'),
    origen: z.enum(['REAL', 'SIMULATED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, { message: 'desde debe ser anterior o igual a hasta', path: ['desde'] });
export type ListAlertsQuery = z.infer<typeof listAlertsSchema>;

export const alertIdSchema = z.object({
  id: z
    .string()
    .trim()
    .refine((v) => z.uuid().safeParse(v).success || /^AL-\d+$/i.test(v), 'Use el uuid o el código AL-0001')
    .describe('uuid o código AL-0001'),
});
export type AlertIdParam = z.infer<typeof alertIdSchema>;

export const updateAlertSchema = z.object({
  status: estado.describe('Nuevo estado de revisión'),
  note: z.string().trim().max(1000).optional().describe('Comentario del operador (opcional)'),
});
export type UpdateAlertBody = z.infer<typeof updateAlertSchema>;

export const backfillAlertsSchema = z
  .object({
    desde: isoDay.describe('Primer día del periodo, inclusive (hora de Bolivia)'),
    hasta: isoDay.describe('Último día del periodo, inclusive (hora de Bolivia)'),
    origen: z.enum(['REAL', 'SIMULATED']).default('REAL').describe('Origen de las detecciones; por defecto solo las reales'),
    nota: z
      .string()
      .trim()
      .max(500)
      .default('Reconstrucción histórica con detecciones reales (generación retroactiva)')
      .describe('Comentario que se guarda en cada alerta creada'),
    aplicar: formBoolean.default(false).describe('false (por defecto): ensayo, solo cuenta. true: crea las alertas'),
  })
  .refine((q) => q.desde <= q.hasta, { message: 'desde debe ser anterior o igual a hasta', path: ['desde'] });
export type BackfillAlertsBody = z.infer<typeof backfillAlertsSchema>;

export const monthlyContextSchema = z.object({
  area_id: z.string().trim().min(1).max(100).optional(),
  solo_alertas: queryBoolean.default(false).describe('true: solo áreas en elevada, alta o muy alta'),
});
export type MonthlyContextQuery = z.infer<typeof monthlyContextSchema>;
