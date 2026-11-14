import { z } from 'zod';
import { isoDay, queryBoolean } from '../../shared/query-schemas.js';

const severidad = z.enum(['Crítica', 'Alta', 'Media']);
const estado = z.enum(['Pendiente', 'En revisión', 'En análisis', 'Verificada']);

export const listAlertsSchema = z
  .object({
    desde: isoDay.optional().describe('Desde, inclusive (YYYY-MM-DD, día en hora de Bolivia)'),
    hasta: isoDay.optional().describe('Hasta, inclusive (YYYY-MM-DD)'),
    area_id: z.string().trim().min(1).max(100).optional().describe('distrito-09, mun-tiquipaya, parque-tunari…'),
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

export const monthlyContextSchema = z.object({
  area_id: z.string().trim().min(1).max(100).optional(),
  solo_alertas: queryBoolean.default(false).describe('true: solo áreas en elevada, alta o muy alta'),
});
export type MonthlyContextQuery = z.infer<typeof monthlyContextSchema>;
