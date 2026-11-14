import { z } from 'zod';
import { formBoolean, isoDay } from '../../../../shared/query-schemas.js';

export const removeSimulatedSchema = z.object({
  hasta: isoDay
    .optional()
    .describe(
      'Último día (hora de Bolivia, inclusive) cuyas detecciones simuladas se borran: el último día con datos reales ' +
        'completos. Sin él se borran TODAS las simuladas.',
    ),
  aplicar: formBoolean.default(false).describe('false (por defecto): ensayo, solo cuenta. true: borra.'),
});
export type RemoveSimulatedBody = z.infer<typeof removeSimulatedSchema>;
